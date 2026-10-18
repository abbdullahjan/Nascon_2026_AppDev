# NaSCon '26 Phase II: Project Rules

Binding spec: docs/SPEC_DAY2.md. Read it before any task.
Phase I code already exists. Extend it, never rewrite or restructure it.

## Stack
- Node.js backend, PostgreSQL, Redis, MediaMTX, Selenium Grid 4 (in compose).
- Object storage is RustFS (S3-compatible), NOT MinIO. Use the AWS S3 SDK
  configured via env vars: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY,
  S3_SECRET_KEY.
- Fixed ports (spec 6.1), never change: 8080, 4444, 4723, 1935, 8888, 8889.

## Hard rules
1. DAY1_SALT and DAY2_SALT come only from env vars. Never hard-code or
   commit them. docker-compose must forward both.
2. Signature = HMAC-SHA256(key = DAY2_SALT as UTF-8,
   message = entity_id + "|" + canonical(payload)). Use the pipe "|".
   Implement once in src/shared and reuse everywhere.
3. Node's JSON.stringify does NOT sort keys. canonical() must recursively
   sort keys at every depth, emit no whitespace, keep non-ASCII unescaped,
   and serialize null/true/false/integers like Python's json.dumps.
   Arrays keep their order. Test against the Appendix A vector, plus
   nested objects and unicode.
4. Validation order everywhere: 400 VALIDATION_ERROR -> 404 *_NOT_FOUND
   -> 403 -> 409.
5. Every non-2xx response: { "error": { "code", "message", "details" } }.
6. Field names, status codes and error codes match the spec exactly.
7. Concurrency: use transactions, unique constraints, upserts or Redis
   atomic ops. No read-then-write races.
8. /audit/v1/* must never return 5xx under load and is exempt from the
   rate limiter.
9. Unit tests per module, target >= 85% line coverage.
10. GIT: never rewrite history, force-push, or amend pushed commits. Never
    commit .env or any salt value. Keep .env in .gitignore. Run
    `git pull --rebase` before pushing.

## Known spec conflicts (ask the developer, don't guess)
- Flood rule: spec 3.3 says >=5 repeated chars, spec 5.8 says >=4 identical
  chars or >=3 consecutive !/?. Use 5.8.
- Do NOT apply a 3-messages-per-2-seconds limit inside
  /audit/v1/moderation/test. k6 needs 0% failures with 50 VUs posting
  every 0.2s, so it must always return 200.
- Co-stream layout capacity check: ask whether "effective participant
  count" is measured before or after the host drop.

## Architecture conventions
- Feature folders in src/modules/<name>/ (guest, qr, moderation, realtime,
  streaming, costream, web). Each exports registerRoutes(app), reset(),
  seed().
- src/shared/ is frozen after the baseline. Changes only as small,
  separate commits, announced to the teammate.
- Migrations use a per-module numeric prefix (e.g. 210_qr_*,
  310_moderation_*). See docs/CONVENTIONS.md.
- Ownership: Person A = guest, qr, web. Person B = moderation, realtime,
  streaming, costream.

## Workflow
One module at a time, only the one named. For each: a plan of at most 10
lines, then implement without waiting for approval unless something is
ambiguous, then unit tests, then curl commands to verify manually.
If the spec contradicts itself, say so instead of guessing.