/**
 * Spec 026 — parse + Zod-validate + ID-synthesize incoming WhatsApp
 * webhook payloads.
 *
 * WhatsApp's webhook payload root has `object: 'whatsapp_business_account'`
 * and a different shape from Instagram:
 *
 *   {
 *     object: 'whatsapp_business_account',
 *     entry: [{
 *       id: '<WABA_ID>',
 *       changes: [{
 *         field: 'messages',
 *         value: {
 *           messaging_product: 'whatsapp',
 *           metadata: { phone_number_id: '...', display_phone_number: '...' },
 *           contacts: [{ profile: { name: '...' }, wa_id: '<from-phone>' }],
 *           messages: [{ id: 'wamid....', from: '...', type: 'text', text: { body: '...' }, ... }],
 *           statuses: [{ id: '...', recipient_id: '...', status: 'delivered', ... }]
 *         }
 *       }, {
 *         field: 'message_template_status_update',
 *         value: { event: 'APPROVED', message_template_id: '...', message_template_name: '...' }
 *       }]
 *     }]
 *   }
 *
 * Each individual `message` / `status` / `template_status` produces ONE
 * ParsedWhatsappEvent. Meta uses `id` (the wamid) as a stable globally-
 * unique identifier — no need to synthesise one for messages. For
 * statuses we hash the (id, status, timestamp) triple because the same
 * wamid receives multiple status callbacks (sent → delivered → read).
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');

// ---- Zod schemas for incoming payload shapes ----

const MetaInfoSchema = z.object({
  phone_number_id: z.string().min(1),
  display_phone_number: z.string().min(1),
});

const ContactSchema = z.object({
  wa_id: z.string().min(1),
  profile: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
});

const InboundMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().min(1), // unix seconds as string per Meta convention
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  // We don't fully type non-text messages in v1 — the payload field on
  // events stores the full `unknown` for later.
});

const StatusSchema = z.object({
  id: z.string().min(1),
  recipient_id: z.string().min(1),
  status: z.string().min(1),
  timestamp: z.string().min(1),
  conversation: z
    .object({
      id: z.string().optional(),
      origin: z.object({ type: z.string().optional() }).optional(),
    })
    .optional(),
  pricing: z
    .object({
      billable: z.boolean().optional(),
      pricing_model: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
});

const MessagesValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: MetaInfoSchema,
  contacts: z.array(ContactSchema).optional(),
  messages: z.array(InboundMessageSchema).optional(),
  statuses: z.array(StatusSchema).optional(),
});

const TemplateStatusValueSchema = z.object({
  event: z.string().min(1), // APPROVED | REJECTED | PAUSED | DISABLED | FLAGGED
  message_template_id: z.string().min(1),
  message_template_name: z.string().min(1),
  message_template_language: z.string().min(1),
  reason: z.string().optional(),
});

const ChangeSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
});

const EntrySchema = z.object({
  id: z.string().min(1), // WABA ID
  changes: z.array(ChangeSchema),
});

const WebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(EntrySchema),
});

// ---- Output type ----

export type ParsedWhatsappEvent =
  | {
      kind: 'whatsappMessage';
      metaEventId: string;
      wabaId: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      fromPhone: string;
      contactName: string | null;
      messageType: string;
      bodyText: string | null;
      timestamp: Date;
      payload: unknown;
    }
  | {
      kind: 'whatsappStatus';
      metaEventId: string;
      wabaId: string;
      phoneNumberId: string;
      messageId: string;
      recipientPhone: string;
      status: string;
      timestamp: Date;
      conversationCategory: string | null;
      payload: unknown;
    }
  | {
      kind: 'whatsappTemplateStatus';
      metaEventId: string;
      wabaId: string;
      event: string;
      metaTemplateId: string;
      templateName: string;
      templateLanguage: string;
      reason: string | null;
      payload: unknown;
    };

/**
 * Detect whether the payload is a WhatsApp webhook (vs IG / FB Pages).
 * Used by routing layer to short-circuit non-WA payloads.
 */
export function isWhatsappPayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  return (payload as { object?: unknown }).object === 'whatsapp_business_account';
}

/**
 * Parse a WhatsApp webhook payload into individual events. Returns an
 * empty array if the payload doesn't validate or has no extractable
 * events — caller treats either as "nothing to do" (still 200 to Meta).
 */
export function parseWhatsappWebhookEvents(payload: unknown): ParsedWhatsappEvent[] {
  const parsed = WebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];

  const out: ParsedWhatsappEvent[] = [];

  for (const entry of parsed.data.entry) {
    const wabaId = entry.id;
    for (const change of entry.changes) {
      if (change.field === 'messages') {
        const valueParsed = MessagesValueSchema.safeParse(change.value);
        if (!valueParsed.success) continue;
        const value = valueParsed.data;
        const phoneNumberId = value.metadata.phone_number_id;
        const displayPhoneNumber = value.metadata.display_phone_number;
        const contactsByPhone: Record<string, string | null> = {};
        if (value.contacts) {
          for (const c of value.contacts) {
            contactsByPhone[c.wa_id] = c.profile?.name ?? null;
          }
        }

        // Inbound messages
        if (value.messages) {
          for (const msg of value.messages) {
            const tsMs = Number.parseInt(msg.timestamp, 10) * 1000;
            const bodyText = msg.text?.body ?? null;
            out.push({
              kind: 'whatsappMessage',
              metaEventId: msg.id, // wamid is globally unique
              wabaId,
              phoneNumberId,
              displayPhoneNumber,
              fromPhone: msg.from,
              contactName: contactsByPhone[msg.from] ?? null,
              messageType: msg.type,
              bodyText,
              timestamp: new Date(Number.isFinite(tsMs) ? tsMs : Date.now()),
              payload: msg,
            });
          }
        }

        // Delivery statuses (sent / delivered / read / failed)
        if (value.statuses) {
          for (const st of value.statuses) {
            const tsMs = Number.parseInt(st.timestamp, 10) * 1000;
            // wamid is reused across status updates — synth a key
            // including the status name to dedupe per-transition.
            const stableInput = `${st.id}|${st.status}|${st.timestamp}`;
            out.push({
              kind: 'whatsappStatus',
              metaEventId: sha256Hex(stableInput),
              wabaId,
              phoneNumberId,
              messageId: st.id,
              recipientPhone: st.recipient_id,
              status: st.status,
              timestamp: new Date(Number.isFinite(tsMs) ? tsMs : Date.now()),
              conversationCategory: st.pricing?.category ?? null,
              payload: st,
            });
          }
        }
      }

      if (change.field === 'message_template_status_update') {
        const valueParsed = TemplateStatusValueSchema.safeParse(change.value);
        if (!valueParsed.success) continue;
        const v = valueParsed.data;
        const stableInput = `tplstatus|${v.message_template_id}|${v.event}`;
        out.push({
          kind: 'whatsappTemplateStatus',
          metaEventId: sha256Hex(stableInput),
          wabaId,
          event: v.event,
          metaTemplateId: v.message_template_id,
          templateName: v.message_template_name,
          templateLanguage: v.message_template_language,
          reason: v.reason ?? null,
          payload: v,
        });
      }
    }
  }

  return out;
}
