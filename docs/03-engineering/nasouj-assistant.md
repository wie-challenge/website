# Nasouj assistant — Milestone 1

## Assessment and scope

Inspection found a client-only scripted Nasouj widget, global Better Auth/CSRF protection,
Prisma-backed API rate limiting and `AccessService.context()` persona resolution. The Python
service contained deterministic matching, pricing and forecast previews. This checkout had no
chat worker, chat schema, LLM abstraction, Redis limiter or RabbitMQ transport to reuse.

Milestone 1 adds the smallest complete chat path: existing Next.js widget → authenticated
NestJS POST → RabbitMQ → Python provider → exclusive RabbitMQ reply queue → HTTP NDJSON.
The original FastAPI decision-support modules and website security boundaries remain in use.
No migration or business-table access is added to Python. Redis is not introduced; existing
rate limits continue to protect the endpoint.

Implementation interfaces: `packages/contracts/src/assistant.ts`, API `modules/assistant/`,
Python `nasj_ai/assistant/`, and web `lib/assistant-stream.ts` plus the existing widget.

## Run locally

Use Node 24, pnpm 11.3.0, Python 3.12+ and Docker. First complete the website's standard
PostgreSQL/mail/authentication setup from [local development](local-development.md).

1. In a private shell, set `NASOUJ_BROKER_PASSWORD` to a generated URL-safe random value.
   Retain it privately; do not paste it in chat, commit it or use a public Next.js variable.
2. From `website/`, run:

   ```bash
   docker --context default compose -p nasj-assistant -f docker-compose.assistant.yml up -d --wait
   pnpm install --frozen-lockfile
   ```

3. Add `ASSISTANT_AMQP_URL=amqp://nasouj:PASSWORD@127.0.0.1:5673/` to the website's private
   `.env`, substituting the generated password. `ASSISTANT_TIMEOUT_MS` defaults to 60000
   (allowed 1000–60000). Omitting the URL disables the assistant endpoint with a safe 503;
   other application modules still start normally. Start the website with `pnpm dev`.
4. In the sibling AI checkout, add `NASJ_CHAT_AMQP_URL` with the same URL to its private
   `.env`. Set `NASJ_CHAT_PROVIDER=fake`, then run:

   ```bash
   uv sync --frozen
   uv run --frozen python -m nasj_ai.assistant_v1.worker
   ```

5. Sign in with an active, verified NASJ user. Open Nasouj from the existing app shell and
   submit a question. The fake response identifies itself as a test and acknowledges missing
   verified knowledge. Language selection supports English, French and Arabic. Context and
   feedback remain in component memory; feedback is not submitted or persisted.

Local Ollama: run your own private runtime and install a model appropriate to your actual RAM
and CPU/GPU budget. No model is selected or downloaded automatically. Set `NASJ_CHAT_PROVIDER=ollama`,
`NASJ_CHAT_OLLAMA_URL=http://127.0.0.1:11434` and `NASJ_CHAT_MODEL` to its installed model name,
then restart the worker. The adapter uses Ollama `/api/chat` streaming, a 1024-token generation
cap and 8192 context setting. `NASJ_CHAT_PROVIDER_TIMEOUT_SECONDS` defaults to 45 (range 1–55).
Keep the API timeout above it. Benchmark French, Arabic and Tunisian Arabic before a pilot;
these language instructions are not proof of model quality.

Container worker: `ai-backend/compose.yaml` includes an opt-in `website-assistant` profile. Supply
`NASJ_CHAT_AMQP_URL` using a broker address reachable from that container (host loopback is
not container loopback). `docker --context default compose --profile website-assistant up --build -d website-assistant`
starts it. Override `NASJ_CHAT_OLLAMA_URL` as appropriate; the host-gateway default requires
Ollama to listen on an interface reachable from the container. Avoid exposing it publicly.
The worker process requires no FastAPI service key. Compose also parses the existing HTTP
service configuration, so run `python scripts/setup_local.py` first to provide that separate key.

## Contract and trust boundaries

`POST /api/v1/assistant/chat` accepts only `{language, messages}`. Each message contains
`role: user|assistant` and `content`. Limit: 10 messages, 2000 characters each, 16000 combined,
last message from user. Browser history is untrusted context, never authorization or system text.
The UI sends recent successful turns only (each assistant context message is clipped to 2000 characters); a refresh clears history. Do not submit sensitive
records: prompts necessarily transit the private broker and configured model runtime.

NestJS resolves personas on every request with `AccessService.context()`, including approved,
active membership requirements. `ADMIN` maps to `PLATFORM_ADMIN`; buyer, association, operator,
NASJ coordinator and finance personas follow existing policy. Other authenticated participants
receive general guidance. The browser cannot supply personas, user IDs, organization IDs,
reply queues or correlation IDs. Persona wording grants no permissions.

Queue `nasouj.chat.v1` is non-durable, bounded to 100 pending messages, with 60-second TTL and
publisher confirms. Broker credentials are a trusted service boundary. Use private ingress,
TLS and scoped broker users/vhosts for deployment. Neither broker nor provider is browser-facing.
Every HTTP request creates a distinct connection and exclusive auto-deleted reply queue.
Responses must match AMQP and payload correlation IDs, strict schemas and sequential event
numbers. NDJSON events are `delta`, `done` (with provider), or safe `error` codes. Replies are
bounded to 16000 characters/4096 events. Each API process admits at most 20 concurrent requests
and one per user, in addition to the existing global rate policy. Multi-process per-user
concurrency coordination is deferred.

HTTP disconnects/timeouts close the broker connection and delete its reply queue. The worker
abandons delivery when the reply queue disappears; an in-progress provider may continue until
its next output or bounded provider deadline. There is no immediate provider cancellation RPC.
Timeouts, malformed output, empty output, tool-call output and truncated streams fail safely.
Provider generation is attempted once; expired and redelivered messages are discarded, preventing
partial-answer replay. The robust Python connection reconnects to the broker; new HTTP requests
make fresh bounded connections. Restart the worker after a startup connection failure.

Access logs contain correlation, allow outcome and persona count, never prompt text, business
records or broker/provider credentials. Standard auth/security logs cover denied requests.
The worker emits a safe startup line or generic startup failure; detailed provider telemetry
and distributed tracing remain future work.

## Verify and troubleshoot

From `website/`: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
With a private test broker and a **fake** Python worker running, export `ASSISTANT_AMQP_URL`
and run `pnpm test:assistant`. This creates and destroys its own PostgreSQL test container,
uses real signup/login/CSRF, rejects forged identities and suspended accounts, and verifies
concurrent EN/FR/AR streams. It does not use or reset the development database.
Set `NASOUJ_TEST_WEB=1` when running that command to also start an isolated Next.js server on
port 3112 and verify real browser login, chat, clear, mobile bounds and keyboard focus. Install
Playwright Chromium first (`pnpm exec playwright install chromium`), or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing compatible executable. Close any service on
port 3112 before this opt-in browser check.

From `ai-backend/`: `uv run --frozen python -m pytest`,
`uv run --frozen python -m ruff check .`, `uv run --frozen python -m ruff format --check .`,
`uv run --frozen python -m mypy src tests scripts`. Evaluation fixtures are
`evaluation/nasouj-phase1.json`; fake-provider checks are deterministic and do not measure
real-model reasoning or prompt-injection resistance. Ollama tests mock its HTTP protocol,
including malformed output, timeouts, truncated responses and unavailable models.

For 401/403, check the real session, email verification, status, CSRF and privileged MFA.
For 503, confirm the private broker URL and credentials and inspect safe worker startup output.
For a terminal timeout, confirm the worker consumes the correct broker/vhost and can reach
Ollama with the exact installed model. No error falls back to a fabricated answer. A partial
reply followed by an error is incomplete and is excluded from subsequent context.

## Next milestone and limits

RAG, citations, knowledge approval/status/provenance, role-filtered documents, durable history,
submitted feedback and live platform tools are **NOT BUILT** by this milestone. Suggestions in
existing UI copy are entry points, not retrieved evidence. Local-model safety instructions
cannot guarantee factual accuracy or injection resistance. No model has authority to read
records, perform payments or grant permissions; no tools execute at all.

Milestone 2 should curate approved NASJ documents, label implemented/planned/simulated facts,
add a testable retrieval baseline with source provenance and permission filtering, and evaluate
uncertainty across EN/FR/AR and Tunisian Arabic. Milestone 3 can then add one NestJS-authorized,
read-only order-status tool with resource and organization isolation tests.

When no broker is configured, the workspace continues to offer its built-in
guide and labels those replies. Guide replies are excluded from live chat
history. A configured worker outage still shows an error.

### Live assistant switch

Set `ASSISTANT_LIVE_ENABLED=true` in the protected API runtime environment
only after a broker and worker are qualified. The default is false even
when a URL is set. Restart the API after a planned configuration change.
Disable the switch to return to the labeled built-in guide. The API holds
response headers until the first accepted delta. A broker or worker
failure before that point offers the guide. Once text starts, failures
leave an incomplete reply and discard the turn from conversation history.
The request deadline begins before authorization and broker connection,
and the published AMQP message expires after the remaining time.
