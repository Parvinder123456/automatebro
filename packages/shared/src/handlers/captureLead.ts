/**
 * Spec 009 — capture-lead handler.
 *
 * Called by the worker when a 'message' event arrives. Extracts email
 * and/or phone from the inbound DM text and upserts a `leads` row keyed
 * on (tenantId, igAccountId, igUserId).
 *
 * The upsert pattern: $set lastSeenAt + email/phone (if found),
 * $setOnInsert _id + firstSeenAt + igUsername. Re-running on the same
 * user updates lastSeenAt + adds new contact info if found, but never
 * changes firstSeenAt or _id.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import type { EventRecord, Lead } from '../types/tenant.js';

// RFC 5322 simplified — good enough for the formats real Instagram
// users actually paste. Anchors are intentionally absent; we want
// "find email anywhere in this DM body".
const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Indian-friendly phone matcher: optional +91 / 91, 10 digits. Also
// accepts international formats with separators (e.g. +1 415 555 0123).
const PHONE_REGEX = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\d/;

interface MessagePayload {
  entry?: { id?: string };
  messaging?: {
    sender?: { id?: string; username?: string };
    message?: { text?: string };
  };
}

export interface CaptureLeadResult {
  status: 'captured' | 'no-text' | 'no-email-or-phone' | 'no-tenant' | 'no-account';
  email?: string;
  phone?: string;
}

/**
 * Validate phone candidate — strip non-digits and require 10–15
 * digits total (covers India + international). Returns canonical
 * E.164-ish form (digits only with optional + prefix preserved) or
 * null if it doesn't qualify.
 */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return hasPlus ? `+${digits}` : digits;
}

export async function captureLead(event: EventRecord): Promise<CaptureLeadResult> {
  if (event.tenantId === null || event.tenantId === undefined) {
    return { status: 'no-tenant' };
  }
  if (event.igAccountId === null || event.igAccountId === undefined) {
    return { status: 'no-account' };
  }

  const payload = event.payload as MessagePayload;
  const messaging = payload.messaging;
  const text = messaging?.message?.text ?? '';
  const senderId = messaging?.sender?.id ?? '';
  const username = messaging?.sender?.username ?? null;

  if (text === '' || senderId === '') {
    return { status: 'no-text' };
  }

  const emailMatch = text.match(EMAIL_REGEX);
  const phoneMatch = text.match(PHONE_REGEX);
  const email = emailMatch?.[0]?.toLowerCase() ?? null;
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;

  if (email === null && phone === null) {
    return { status: 'no-email-or-phone' };
  }

  const db = await getDb();
  const now = new Date();

  // Upsert the lead row. $set the things we ALWAYS want refreshed
  // (lastSeenAt, igUsername if newly known); $setOnInsert the
  // immutable identity fields.
  const setFields: Partial<Lead> = { lastSeenAt: now };
  if (username !== null) setFields.igUsername = username;
  if (email !== null) setFields.email = email;
  if (phone !== null) setFields.phone = phone;

  await db.updateOne(
    'leads',
    {
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
      igUserId: senderId,
    } as never,
    {
      $set: setFields,
      $setOnInsert: {
        _id: randomUUID(),
        tenantId: event.tenantId,
        igAccountId: event.igAccountId,
        igUserId: senderId,
        firstSeenAt: now,
        tags: [],
        attributedAutomationId: null,
      },
    } as never,
    true, // upsert
  );

  logger.info(
    {
      eventId: event._id,
      tenantId: event.tenantId,
      igUserId: senderId,
      hasEmail: email !== null,
      hasPhone: phone !== null,
    },
    'captureLead: upserted',
  );

  const result: CaptureLeadResult = { status: 'captured' };
  if (email !== null) result.email = email;
  if (phone !== null) result.phone = phone;
  return result;
}
