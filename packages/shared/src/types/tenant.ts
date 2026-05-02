/**
 * Spec 003 — TypeScript types mirroring the StrictDB schemas.
 *
 * Inferred from the Zod schemas in db/schema.ts so types and runtime
 * validation can never drift. Importers should use these types for
 * variable annotations; the schemas themselves are used for runtime
 * parsing of untrusted input.
 */
import type { z } from 'zod';
import type { IgAccountSchema, TenantSchema, TenantUserSchema, UserSchema } from '../db/schema.js';

export type Tenant = z.infer<typeof TenantSchema>;
export type User = z.infer<typeof UserSchema>;
export type TenantUser = z.infer<typeof TenantUserSchema>;
export type Role = TenantUser['role'];
export type IgAccount = z.infer<typeof IgAccountSchema>;
