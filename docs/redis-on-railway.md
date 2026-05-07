# Redis on Railway — setup, swap-back, and the math

> **TL;DR:** Production Redis is a Railway add-on inside the same project
> as the worker. Upstash is kept around as a paused fallback. Migration
> is purely an `REDIS_URL` env var swap — no code changes.

---

## Why we're not on Upstash any more

Upstash bills per Redis command. BullMQ's poll script runs 7 Lua
sub-commands inside one `EVALSHA` every ~30 seconds, plus `BZPOPMIN`
and a stalled-job checker. **Every Lua sub-command counts separately
on Upstash.** That works out to ~780K commands/month even with zero
traffic and the most aggressive worker tuning we could safely run.

Upstash's free tier is 500K/month. So a continuously-running BullMQ
worker on free Upstash is mathematically exhausted in ~19 days, less
once real webhooks land. See `CLAUDE.md` → "Worker / Redis hosting
(2026-05-07)" for the full breakdown.

Railway Redis is **memory-billed** (included in our $5 hobby plan),
so command count doesn't matter. Same Redis protocol, same `REDIS_URL`
shape, same ioredis client — only the URL changes.

---

## Adding Railway Redis to the project (first time)

Do this once. The add-on lives forever after.

1. Open the **automatebro** project in https://railway.app
2. Click **+ New** (top-right of the project canvas)
3. **Database** → **Add Redis**
4. Wait ~30 seconds for Railway to provision a Redis instance. The
   service appears as a new tile alongside `worker` and `web` (if web
   is also on Railway).
5. Click the new **Redis** tile → **Variables** tab. Note the
   `REDIS_URL` Railway auto-generated. It looks like:

   ```
   redis://default:<generated-password>@<some-host>.railway.internal:6379
   ```

   The `.railway.internal` host only works inside the Railway private
   network (i.e. only your Railway services can reach it — Vercel cannot).
   For external clients (Vercel, your laptop), copy the **public
   URL** Railway also shows: `redis://default:<password>@<host>.proxy.rlwy.net:<port>`.

---

## Pointing the worker at Railway Redis

The Railway worker can use the **internal** URL — faster, no egress
fee. In the **worker** service:

1. **Variables** tab
2. Find `REDIS_URL` (currently the Upstash URL) → click **Edit**
3. Paste the Railway **internal** URL (`...railway.internal:6379`)
4. Save → Railway auto-redeploys (~60s)

Verify in **Deploy Logs**: should show
```
[SQL] SQL pool connected (standard preset, max=10)
worker ready  pid: <n>  hostname: <id>
```

No reconnect spam, no `ECONNRESET`.

---

## Pointing Vercel at Railway Redis

Vercel cannot reach `.railway.internal`. Use the **public proxy** URL.

1. Vercel → **bloomdm** project → **Settings** → **Environment
   Variables**
2. Find `REDIS_URL` → **Edit** → paste the Railway **public** URL
   (`...proxy.rlwy.net:<port>`)
3. Tick **Production**, **Preview**, **Development**
4. Save
5. **Deployments** tab → top deployment → **⋯** → **Redeploy**

Verify by hitting `/api/v1/webhooks/meta` with a test payload — the
event should land in the queue, the worker should pick it up.

---

## Local development

Local `.env` line 29:

```
REDIS_URL=<Railway public proxy URL>
```

Or, simpler for local dev: spin up a local Redis in Docker and point
at it. Local doesn't need to use the cloud Redis at all. See the dev
section in `docs/getting-started.md`.

---

## Swapping back to Upstash (emergency fallback)

The Upstash database is kept paused, not deleted, so we can fall back
in <5 minutes if Railway Redis ever has an outage:

1. Upstash dashboard → **Bloomdm** database → **Resume** (if paused)
2. Copy the `rediss://` URL from the **Details** tab
3. Update `REDIS_URL` in Railway worker + Vercel + local `.env` to that URL
4. Redeploy both services
5. Worker boots against Upstash, picks up where it left off

The free Upstash cap is 500K cmds/month, so emergency fallback gives
you ~19 days before you have to either fix Railway or upgrade Upstash
to pay-as-you-go.

**Don't delete the Upstash database.** It's free, it's our parachute.

---

## Cost ceiling — what does Railway Redis actually cost?

Inside the $5 Railway Hobby plan, Redis usage is bundled with the rest
of your project's compute/memory budget. The Redis service shows up as
its own line item in the project's resource graph (look at **Usage**
in project settings).

Practical numbers for AutomateBro at v1:
- **Memory used by Redis at zero traffic:** <1 MB (just BullMQ
  bookkeeping keys + the heartbeat key)
- **Memory under typical load:** ~5-50 MB depending on backlog
- **Hobby plan memory budget:** 8 GB total across all project services

Even at 10× our projected traffic, Redis is a rounding error inside
the hobby plan. The only failure mode is the **whole project**
exceeding 8 GB or $5/month — which would be a memory issue in the web
or worker services long before Redis itself.

If we ever do exceed the hobby plan, Pro is $20/month with a much
larger budget. Still cheaper than Upstash pay-as-you-go for any
non-trivial workload, because BullMQ's polling model burns commands
fast.

---

## Tuning state (worker config that's checked in)

`apps/worker/src/index.ts` ships with:

- `WORKER_CONCURRENCY = 1`
- `drainDelay: 30` (seconds — BLPOP timeout)
- `stalledInterval: 5 * 60_000` (ms — 5 min)
- `HEARTBEAT_INTERVAL_MS = 5 * 60_000` (ms — 5 min)

These are tuned for low command-burn and were forced on us by Upstash
free tier. They're still safe (and slightly more efficient) on
Railway Redis. To raise throughput when real traffic arrives:

| Knob | Current | When to bump |
|---|---|---|
| `WORKER_CONCURRENCY` | 1 | When p50 job-pickup latency hits >5s |
| `drainDelay` | 30 | When p99 first-job-after-idle-period >30s and that matters |
| `stalledInterval` | 5min | Probably never; only matters during crashes |
| `HEARTBEAT_INTERVAL_MS` | 5min | Probably never; just a "still alive" beacon |

Suggested next-step values (if/when traffic justifies):
`concurrency=5, drainDelay=5, stalledInterval=30s, heartbeat=30s` —
the original BullMQ defaults.
