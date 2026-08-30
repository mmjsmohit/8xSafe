# Repository guide

This repository is an npm workspace with `apps/api`, `apps/mobile`, and
`packages/contracts`.

## Commands

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run mobile:export`
- `npm run db:check`

## Boundaries

- Parse external input with Zod at the route, provider, environment, or storage boundary.
- Keep provider credentials and SDKs in `apps/api`. Mobile may receive only public Expo variables.
- Never log passwords, tokens, transcript bodies, provider secrets, or private phone numbers.
- Never record or persist raw call audio or voice-enrollment samples.
- Shared owner-facing request and response schemas belong in `packages/contracts`.
- Provider webhook payloads stay private to `apps/api` adapters.
- Add database changes through Drizzle schema and a committed SQL migration.
- Keep tests beside their owning app under `test` or as `*.test.ts(x)`.

Workers must stay inside their task's path list, commit their work, and report adjacent issues instead of fixing them.

