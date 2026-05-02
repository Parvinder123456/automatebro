# Spec 006 — Worker + Queue Consumer

> **MDD phase:** Document → implementation. Compressed loop.
> **Implements:** §Appendix B item 6 of `docs/engineering-plan.md`.

**Status:** Implementation in progress
**Branch:** `feat/spec-006-worker-queue`

---

## 1. Goal

Turn the worker from "boots and idles" (spec 001) into a real BullMQ
consumer that pulls jobs off the `events` queue and dispatches them
to handlers. After this lands, the webhook ingest path (spec 005)
enqueues a `process-event` job for each new event row, and the worker
picks it up and marks `events.processedAt = now()`.

The actual business logic (comment matching → send DM, lead parsing,
AI reply generation) lives in specs 007–009. Spec 006's job handlers
for those types are STUBS that log "would do X" and update
`events.processedAt`. This keeps spec 006's scope tight and lets us
verify the end-to-end queue path before adding business logic.

---

## 2. Out of scope

- Comment-to-DM matching → spec 007
- Outbound Meta send call → spec 007
- AI reply generation → spec 008
- Lead capture parsing → spec 009
- Dead-letter queue UI → spec 011 (or post-launch admin)
- Per-tenant cost caps → spec 008 (`aiUsage`)

---

## 3. Architectural decisions

### 3.1 Single queue, discriminated-union jobs

Per engineering plan §3 (lightened design), we ship ONE queue called
`events` with a typed `JobData` union. The Worker's process function
switches on `data.type` and dispatches to the right handler. If a job
type ever needs isolation (long-running, separate scaling), we split.

### 3.2 Rate limiter — BullMQ's `groupKey` per `igAccountId`

Meta's per-IG-account limit is ~200 DMs/hour. We cap at **185/hour**
(7.5% buffer) to stay safely below. BullMQ's built-in limiter with
`groupKey` enforces per-account rate without us writing a custom
Redis semaphore.

```ts
new Worker('events', process, {
  connection,
  concurrency: 5,
  limiter: {
    max: 185,
    duration: 60 * 60 * 1000, // 1 hour
    groupKey: 'igAccountId', // takes from job.opts.group.id at add-time
  },
});
```

When enqueuing, jobs that have an associated `igAccountId` pass it
as a group:
```ts
queue.add('send-dm', payload, {
  group: { id: igAccountId },
});
```

Jobs without `igAccountId` (rare) skip the limiter — they don't
contribute to the rate cap.

### 3.3 Idempotency at the handler level

Jobs can be retried (BullMQ retries on failure with exponential
backoff). Handlers must be idempotent. The simplest pattern: each
handler updates `events.processedAt` via `WHERE processedAt IS NULL`
— the second attempt is a no-op.

### 3.4 Failure → dead-letter via job retries

BullMQ retries each job up to 3 times with exponential backoff
(1s, 5s, 25s) by default. After max retries, the job goes to the
"failed" set in Redis. Spec 011 will add a UI to inspect; for now
we just log to Axiom (when wired in spec 014).

### 3.5 Ingest path enqueues after persisting

`ingestMetaWebhook` already persists events. After insert, it
enqueues one job per inserted event:
```ts
await eventsQueue.add('process-event', { type: 'process-event', eventId }, {
  group: { id: igAccountId ?? 'no-account' },
});
```

If queue.add fails (Redis hiccup), we log + continue. Meta sees a 200
because the event is persisted; spec 011 will add a "process pending
events" admin button to retry stuck events.

---

## 4. File layout

```
packages/shared/src/queue/
├── jobTypes.ts                              # NEW — discriminated union + Zod
└── queues.ts                                # MODIFIED — add dispatch helper

apps/worker/src/
├── index.ts                                 # MODIFIED — instantiate Worker
└── jobs/
    ├── processEvent.ts                      # NEW — fully implemented
    ├── sendDM.ts                            # NEW — stub for spec 007
    ├── captureLead.ts                       # NEW — stub for spec 009
    └── generateAiReply.ts                   # NEW — stub for spec 008

packages/shared/src/handlers/webhooks/
└── ingestMetaWebhook.ts                     # MODIFIED — enqueue after insert

tests/
├── integration/
│   └── workerProcessing.test.ts             # NEW — end-to-end queue test
└── unit/
    └── jobTypes.test.ts                     # NEW — discriminator parsing
```

---

## 5. Job types

```ts
// packages/shared/src/queue/jobTypes.ts
import { z } from 'zod';

export const ProcessEventJob = z.object({
  type: z.literal('process-event'),
  eventId: z.string().uuid(),
});

export const SendDMJob = z.object({
  type: z.literal('send-dm'),
  sendId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  recipientPsid: z.string().min(1),
  content: z.string().min(1),
  automationId: z.string().uuid().nullable(),
});

export const CaptureLeadJob = z.object({
  type: z.literal('capture-lead'),
  eventId: z.string().uuid(),
});

export const GenerateAiReplyJob = z.object({
  type: z.literal('generate-ai-reply'),
  eventId: z.string().uuid(),
  responseId: z.string().uuid(),
});

export const JobData = z.discriminatedUnion('type', [
  ProcessEventJob,
  SendDMJob,
  CaptureLeadJob,
  GenerateAiReplyJob,
]);

export type JobData = z.infer<typeof JobData>;
```

---

## 6. Acceptance criteria

### 6.1 Unit
- `JobData` parses each variant
- `JobData` rejects unknown `type`

### 6.2 Integration (real Postgres + Redis)
- Worker bootstrap subscribes to `events` queue
- Enqueue a `process-event` job → worker picks it up → `events.processedAt` set
- Idempotency: re-process the same event → `processedAt` not modified
- Stub job types (send-dm, capture-lead, generate-ai-reply) log + complete

### 6.3 Build/lint/types
All clean.

---

## 7. Risks

1. **Rate-limit groupKey requires `group.id` on Queue.add**. We pass
   it on every job. Jobs without `igAccountId` use a sentinel like
   `'no-account'` so they're rate-limited together (won't matter at
   our scale).

2. **Test instability under rate limiter**. The BullMQ rate limiter
   uses Redis sets with TTLs. For tests, max=185/hr is fine — we
   never hit it. But CI must clean up between runs.

3. **Dead jobs on dev restart**. If you SIGINT the worker mid-job,
   BullMQ may stall the job and re-deliver after stalled-job timeout
   (default 30s). Acceptable for dev.

---

**END OF SPEC — proceeding to implementation.**
