/**
 * Spec 026 — typed WhatsApp Cloud API client.
 *
 * Thin HTTP wrapper around the Cloud API endpoints we use:
 *   - send freeform text (in-window)
 *   - send template (any time, with category-based pricing)
 *   - submit template for Meta approval
 *   - read phone number metadata + tier/quality (for connect / nightly refresh)
 *   - mark inbound message as read (clears the customer's "Sent" tick)
 *
 * Error model mirrors the IG adapter: a single `WhatsappApiError` with
 * statusCode + Meta error code/subcode for retry decisions.
 *
 * This module is HTTP-only — no DB writes, no encryption, no business
 * logic. Caller passes the decrypted access token + phoneNumberId.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const REQUEST_TIMEOUT_MS = 15_000;

export class WhatsappApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly metaCode?: number,
    public readonly metaSubcode?: number,
  ) {
    super(message);
    this.name = 'WhatsappApiError';
  }

  /**
   * True for transient failures worth retrying (5xx, timeout, transient
   * Meta errors). False for client errors that won't fix themselves
   * (invalid token, bad recipient, opted out).
   */
  isRetryable(): boolean {
    if (this.statusCode === 0 || this.statusCode >= 500) return true;
    if (this.statusCode === 429) return true;
    // Meta error 131056 = "pair rate limit", 131048 = "spam rate", retry
    // after backoff. Error 131047 = "outside service window" — NOT retry,
    // caller must use a template instead.
    return this.metaCode === 131056 || this.metaCode === 131048;
  }
}

async function whatsappFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WhatsappApiError(`WhatsApp API request timed out after ${REQUEST_TIMEOUT_MS}ms`, 0);
    }
    throw new WhatsappApiError(
      `WhatsApp API network error: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
  clearTimeout(timeoutId);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WhatsappApiError(
      `WhatsApp API returned non-JSON response (status ${response.status})`,
      response.status,
    );
  }

  if (!response.ok) {
    const errorEnv = body as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    const message = errorEnv.error?.message ?? `HTTP ${response.status}`;
    throw new WhatsappApiError(
      `WhatsApp API error: ${message}`,
      response.status,
      errorEnv.error?.code,
      errorEnv.error?.error_subcode,
    );
  }

  return body;
}

// ============================================================
// Send freeform message (in-window only)
// ============================================================

export interface SendFreeformArgs {
  accessToken: string;
  phoneNumberId: string;
  /** E.164 phone, e.g. '+919876543210'. Cloud API also accepts no-+ form. */
  toPhone: string;
  text: string;
}

export interface SendResult {
  /** Meta's wamid for the outbound message. Use as idempotency key. */
  metaMessageId: string;
}

export async function sendFreeformMessage(args: SendFreeformArgs): Promise<SendResult> {
  const url = `${GRAPH_API_BASE}/${args.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: args.toPhone,
    type: 'text',
    text: { preview_url: false, body: args.text },
  };
  const result = (await whatsappFetch(url, args.accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as {
    messages?: Array<{ id: string }>;
  };
  const id = result.messages?.[0]?.id;
  if (id === undefined || id.length === 0) {
    throw new WhatsappApiError('WhatsApp send: missing messages[0].id in response', 200);
  }
  return { metaMessageId: id };
}

// ============================================================
// Send template message (any time)
// ============================================================

export interface SendTemplateArgs {
  accessToken: string;
  phoneNumberId: string;
  toPhone: string;
  /** Approved Meta template name. */
  templateName: string;
  /** BCP-47-ish language code, e.g. 'en_US'. */
  language: string;
  /** Body parameter values, in order. Empty array if template has no variables. */
  bodyParams: ReadonlyArray<string>;
}

export async function sendTemplateMessage(args: SendTemplateArgs): Promise<SendResult> {
  const url = `${GRAPH_API_BASE}/${args.phoneNumberId}/messages`;
  const components =
    args.bodyParams.length === 0
      ? []
      : [
          {
            type: 'body',
            parameters: args.bodyParams.map((value) => ({ type: 'text', text: value })),
          },
        ];
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: args.toPhone,
    type: 'template',
    template: {
      name: args.templateName,
      language: { code: args.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
  const result = (await whatsappFetch(url, args.accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as {
    messages?: Array<{ id: string }>;
  };
  const id = result.messages?.[0]?.id;
  if (id === undefined || id.length === 0) {
    throw new WhatsappApiError('WhatsApp template send: missing messages[0].id in response', 200);
  }
  return { metaMessageId: id };
}

// ============================================================
// Submit a new template for Meta approval
// ============================================================

export interface SubmitTemplateArgs {
  accessToken: string;
  wabaId: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  bodyText: string;
  footerText?: string;
}

export interface SubmitTemplateResult {
  metaTemplateId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED';
}

export async function submitTemplate(args: SubmitTemplateArgs): Promise<SubmitTemplateResult> {
  const url = `${GRAPH_API_BASE}/${args.wabaId}/message_templates`;
  const components: Array<Record<string, unknown>> = [{ type: 'BODY', text: args.bodyText }];
  if (args.footerText !== undefined && args.footerText.length > 0) {
    components.push({ type: 'FOOTER', text: args.footerText });
  }
  const body = {
    name: args.name,
    category: args.category,
    language: args.language,
    components,
  };
  const result = (await whatsappFetch(url, args.accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { id?: string; status?: string };
  if (result.id === undefined || result.id.length === 0) {
    throw new WhatsappApiError('WhatsApp template submit: missing id in response', 200);
  }
  return {
    metaTemplateId: result.id,
    status: (result.status ?? 'PENDING') as SubmitTemplateResult['status'],
  };
}

// ============================================================
// Read phone-number metadata (for connect verification + tier refresh)
// ============================================================

export interface PhoneNumberInfo {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  messagingTier: 'TIER_50' | 'TIER_250' | 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'TIER_UNLIMITED';
}

export async function getPhoneNumberInfo(args: {
  accessToken: string;
  phoneNumberId: string;
}): Promise<PhoneNumberInfo> {
  const url = new URL(`${GRAPH_API_BASE}/${args.phoneNumberId}`);
  url.searchParams.set(
    'fields',
    'id,display_phone_number,verified_name,quality_rating,messaging_limit_tier',
  );
  const result = (await whatsappFetch(url.toString(), args.accessToken)) as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    messaging_limit_tier?: string;
  };
  if (result.id === undefined) {
    throw new WhatsappApiError('WhatsApp phone info: missing id in response', 200);
  }
  return {
    phoneNumberId: result.id,
    displayPhoneNumber: result.display_phone_number ?? '',
    verifiedName: result.verified_name ?? null,
    qualityRating: (result.quality_rating ?? 'UNKNOWN').toUpperCase() as
      | 'GREEN'
      | 'YELLOW'
      | 'RED'
      | 'UNKNOWN',
    messagingTier: (result.messaging_limit_tier ?? 'TIER_1K') as PhoneNumberInfo['messagingTier'],
  };
}

// ============================================================
// Mark an inbound message as read (clears blue ticks)
// ============================================================

export async function markMessageRead(args: {
  accessToken: string;
  phoneNumberId: string;
  /** wamid of the inbound message. */
  metaMessageId: string;
}): Promise<void> {
  const url = `${GRAPH_API_BASE}/${args.phoneNumberId}/messages`;
  await whatsappFetch(url, args.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: args.metaMessageId,
    }),
  });
}
