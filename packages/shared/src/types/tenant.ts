/**
 * Spec 003 — TypeScript types mirroring the StrictDB schemas.
 *
 * Inferred from the Zod schemas in db/schema.ts so types and runtime
 * validation can never drift. Importers should use these types for
 * variable annotations; the schemas themselves are used for runtime
 * parsing of untrusted input.
 */
import type { z } from 'zod';
import type {
  AutomationSchema,
  EventSchema,
  IgAccountSchema,
  ResponseSchema,
  SendSchema,
  TenantSchema,
  TenantUserSchema,
  TriggerSchema,
  UserSchema,
} from '../db/schema.js';

export type Tenant = z.infer<typeof TenantSchema>;
export type User = z.infer<typeof UserSchema>;
export type TenantUser = z.infer<typeof TenantUserSchema>;
export type Role = TenantUser['role'];
export type IgAccount = z.infer<typeof IgAccountSchema>;
export type EventRecord = z.infer<typeof EventSchema>;
export type EventKind = EventRecord['kind'];
export type Automation = z.infer<typeof AutomationSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type ResponseRecord = z.infer<typeof ResponseSchema>;
export type Send = z.infer<typeof SendSchema>;
