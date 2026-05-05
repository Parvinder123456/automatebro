/**
 * Spec 008 — typed OpenAI client.
 *
 * Two endpoints in v1:
 *   - chat.completions (gpt-4o-mini) — generate the AI reply
 *   - moderations (omni-moderation-latest) — pre-send safety gate
 *
 * Hand-rolled (~80 lines) instead of the official SDK because:
 *   - One file to read; one place to swap providers
 *   - Smaller bundle (the SDK pulls in ~150 KB of polyfills)
 *   - Auditability for the AI cost path
 *
 * Pricing (cents per 1M tokens) hard-coded for gpt-4o-mini as of
 * 2026; update when OpenAI changes.
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODERATION_URL = 'https://api.openai.com/v1/moderations';
const REQUEST_TIMEOUT_MS = 10_000;

const MODEL_CHAT = 'gpt-4o-mini';
const MODEL_MODERATION = 'omni-moderation-latest';

// Cost per 1M tokens, in USD.
const PRICE_INPUT_USD = 0.15;
const PRICE_OUTPUT_USD = 0.6;
// Conversion to paise — 1 USD = ₹84 cached. 1 INR = 100 paise.
const INR_PER_USD = 84;
const PAISE_PER_INR = 100;

export class OpenAiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'OpenAiError';
  }
}

interface OpenAiCallOpts {
  apiKey: string;
}

async function openaiFetch(url: string, body: unknown, opts: OpenAiCallOpts): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OpenAiError(`OpenAI timeout after ${REQUEST_TIMEOUT_MS}ms`, 0, true);
    }
    throw new OpenAiError(
      `OpenAI network error: ${err instanceof Error ? err.message : String(err)}`,
      0,
      true,
    );
  }
  clearTimeout(timeoutId);

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    const msg = json.error?.message ?? `HTTP ${response.status}`;
    const retryable = response.status >= 500 || response.status === 429;
    throw new OpenAiError(`OpenAI: ${msg}`, response.status, retryable);
  }
  return json;
}

export interface ChatCompletionInput {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chatCompletion(
  input: ChatCompletionInput,
  opts: OpenAiCallOpts,
): Promise<ChatCompletionResult> {
  const body = {
    model: MODEL_CHAT,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    max_tokens: input.maxTokens ?? 200,
    temperature: input.temperature ?? 0.7,
  };
  const result = (await openaiFetch(CHAT_URL, body, opts)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = result.choices?.[0]?.message?.content ?? '';
  if (content === '') {
    throw new OpenAiError('OpenAI returned empty content', 0, false);
  }
  return {
    content,
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
  };
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export async function moderate(text: string, opts: OpenAiCallOpts): Promise<ModerationResult> {
  const result = (await openaiFetch(
    MODERATION_URL,
    { model: MODEL_MODERATION, input: text },
    opts,
  )) as {
    results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
  };
  const item = result.results?.[0];
  if (!item) {
    throw new OpenAiError('OpenAI moderation returned no results', 0, false);
  }
  const flaggedCategories = Object.entries(item.categories ?? {})
    .filter(([, flagged]) => flagged === true)
    .map(([cat]) => cat);
  return {
    flagged: item.flagged === true,
    categories: flaggedCategories,
  };
}

/**
 * Compute cost in paise from token usage. gpt-4o-mini rates;
 * update PRICE_* constants when OpenAI changes pricing.
 */
export function computeCostPaise(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * PRICE_INPUT_USD + outputTokens * PRICE_OUTPUT_USD) / 1_000_000;
  return Math.ceil(usd * INR_PER_USD * PAISE_PER_INR);
}

// ---------- Spec 016: intent classifier ----------

const INTENT_LABELS = ['buying', 'support', 'spam', 'other'] as const;
type IntentLabel = (typeof INTENT_LABELS)[number];

const CLASSIFY_SYSTEM_PROMPT = `You classify Instagram comments and DMs into ONE of four intents:
- buying: user expresses purchase intent ("how much?", "is this in stock?", "I'll take 2", "where to order").
- support: user has a question, problem, or complaint about an order, product, or service.
- spam: promotional/irrelevant link drops, repetitive emoji floods, scams, or off-topic noise.
- other: greetings, compliments, ambiguous chatter that doesn't fit the other three.
Reply ONLY as compact JSON: {"intent":"...","confidence":0.0-1.0}. Confidence reflects how clearly the input fits the chosen label. No prose.`;

export interface ClassifyIntentInput {
  text: string;
}

export interface ClassifyIntentResult {
  intent: IntentLabel;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
}

export async function classifyIntent(
  input: ClassifyIntentInput,
  opts: OpenAiCallOpts,
): Promise<ClassifyIntentResult> {
  const body = {
    model: MODEL_CHAT,
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: input.text },
    ],
    max_tokens: 30,
    temperature: 0.0,
    // Force structured JSON output.
    response_format: { type: 'json_object' },
  };
  const result = (await openaiFetch(CHAT_URL, body, opts)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = result.choices?.[0]?.message?.content ?? '';
  if (content === '') {
    throw new OpenAiError('OpenAI classifier returned empty content', 0, false);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new OpenAiError(`OpenAI classifier returned non-JSON: ${content.slice(0, 80)}`, 0, false);
  }
  const obj = parsed as { intent?: unknown; confidence?: unknown };
  const rawIntent = typeof obj.intent === 'string' ? obj.intent.toLowerCase() : '';
  const intent = (INTENT_LABELS as readonly string[]).includes(rawIntent)
    ? (rawIntent as IntentLabel)
    : 'other';
  const rawConfidence = typeof obj.confidence === 'number' ? obj.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  return {
    intent,
    confidence,
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
  };
}
