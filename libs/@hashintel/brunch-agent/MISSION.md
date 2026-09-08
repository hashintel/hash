# Brunch remote browser-origin policy

## Status

**Live as of 2026-09-08** for
[FE-1626](https://linear.app/hash/issue/FE-1626/add-cors-handling-to-brunch-agents-agents-routes-for-the-petrinaut)
on `kafe-1626-cors-agents-routes`, cut directly from `main` after
[FE-1574](https://github.com/hashintel/hash/pull/9528) established
`/agents/chat/:instanceId` as the Petrinaut browser's Brunch transport and
[FE-1625](https://github.com/hashintel/hash/pull/9573) made the image deployable on ECS.
This file is the branch's sole execution authority.

The owner selected deployment-configured exact origins over wildcard preview-host patterns or a
new same-origin proxy. The policy is a browser boundary only: it does not authenticate a caller,
authorize a conversation, or make public exposure safe by itself.

## Imperative

Let a deployed Petrinaut website use the Brunch `/agents/*` Flue routes from an explicitly trusted
browser origin while granting no cross-origin access to unlisted origins. Do this now because the
Petrinaut Vercel deployment and Brunch ECS service are separate origins and
[SRE-1042](https://linear.app/hash/issue/SRE-1042/configure-petrinauts-deployment-variables-for-the-brunch-agent-chat)
cannot point the browser at the deployed Brunch route until preflight and response headers work.

## Throughline

```text
Petrinaut browser at one configured exact origin
→ OPTIONS /agents/<agent>/<instance> with requested method and headers
→ route-scoped Hono CORS middleware before ownership middleware
→ 204 preflight carrying the matching origin, GET/POST/OPTIONS, and Flue request headers
→ browser FlueClient GET/POST with x-brunch-principal + x-brunch-conversation
→ existing agentOwnershipGuard and createAgentRouter
→ response exposes the Flue/Durable Streams headers the browser SDK reads
```

`BRUNCH_CORS_ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins read when the app
starts. Values may have surrounding whitespace and an origin's optional trailing slash; they are
normalized through `URL.origin` and deduplicated. A configured value containing credentials, a
non-root path, query, fragment, wildcard, opaque origin, or non-HTTP(S) scheme is a startup
configuration error. Missing or blank configuration means an empty allowlist: same-origin and
non-browser callers continue through the existing route, but no cross-origin caller receives a
CORS grant.

The middleware applies only to `/agents/*` and runs before `agentOwnershipGuard`, so a valid
preflight does not need conversation headers. It permits `GET`, `POST`, and `OPTIONS`; permits
`Content-Type`, `x-brunch-principal`, and `x-brunch-conversation`; does not permit credentials; and
uses a 600-second preflight cache. It exposes the non-safelisted response headers read by the
installed Flue 2.0.3 and Durable Streams 0.2.6 clients:

- `flue-error-ref`
- `Stream-Next-Offset`
- `Stream-Cursor`
- `Stream-Up-To-Date`
- `Stream-Closed`
- `stream-sse-data-encoding`

Hono's maintained CORS middleware owns header emission, `Vary` handling, and the `OPTIONS` response.
An unlisted origin may still receive an ordinary HTTP response when it directly sends a request,
but that response carries no `Access-Control-Allow-Origin`; the browser therefore grants it no
cross-origin access.

## Proof

This mission establishes the application-side CORS contract required by the deployed browser
transport. It does **not** establish authentication, authorization, rate limiting, infrastructure
configuration, a deployed endpoint, or end-to-end remote verification.

1. **Configuration is exact and fail-closed.** Missing and blank configuration produce no allowed
   origins; whitespace, trailing slashes, duplicates, and multiple exact origins normalize
   deterministically; malformed or broader-than-origin entries fail with the offending variable
   named. Oracle: focused unit cases in `apps/brunch-agent/test/cors.test.ts`.
2. **Allowed browser traffic receives the complete grant.** An allowed origin receives its exact
   value on an `/agents/*` response. Its preflight receives 204 before ownership, the three allowed
   methods, the three allowed request headers, the six exposed response headers, no credentials
   grant, and the required `Vary` values. Oracle: in-process Hono requests in
   `apps/brunch-agent/test/cors.test.ts`.
3. **Rejected origins receive no grant.** An unlisted origin's preflight and ordinary response omit
   `Access-Control-Allow-Origin`; an allowed origin does not make another origin pass. Oracle:
   focused negative cases in `apps/brunch-agent/test/cors.test.ts`.
4. **The policy cannot widen unrelated routes.** `/health`, `/`, and `/assets/*` carry no Brunch
   CORS grant. Existing ownership checks still return 401/403 for actual agent requests with
   missing or mismatched identity. Oracle: CORS route-scope tests plus the existing
   `apps/brunch-agent/test/agent-ownership.test.ts`.
5. **The shipped artifact and operator contract agree.** Brunch's README documents the variable,
   exact-origin examples (`https://demo.petrinaut.org`, `https://petrinaut.stage.hash.ai`, and a
   selected stable `petrinaut-git-<branch>.stage.hash.ai` alias), empty-list behavior, and the fact
   that CORS is not authentication. Oracle:
   `yarn workspace @apps/brunch-agent test:unit`,
   `yarn workspace @apps/brunch-agent lint:tsc`,
   `yarn workspace @apps/brunch-agent lint:eslint`, and
   `yarn workspace @apps/brunch-agent build`.

## Constraints

- Use Hono's built-in CORS middleware; do not create a parallel HTTP server or hand-maintain generic
  CORS response logic.
- Keep one Flue product route and the existing ownership guard. CORS must not add, proxy, rename, or
  reinterpret an agent route.
- The origin list is exact. Do not hard-code Petrinaut domains, accept wildcard entries, infer trust
  from `.stage.hash.ai`, reflect arbitrary `Origin` values, or silently skip malformed entries.
- Keep credentials disabled. The current browser client uses explicit ownership headers, not
  cookies, and those headers are not authentication.
- Answer preflight before ownership while preserving ownership enforcement on every non-preflight
  agent request.
- Read configuration once at startup. Dynamic policy storage or hot reload is not earned by this
  deployment.
- Preserve local same-origin proxying when the variable is unset.
- No implementation begins until this authority cut is committed separately. Material changes to
  this contract require owner review and another focused authority commit.

### Expected touched paths

```text
~ libs/@hashintel/brunch-agent/MISSION.md      branch authority
+ apps/brunch-agent/src/http/cors.ts           exact-origin parsing and Hono middleware
~ apps/brunch-agent/src/app.ts                 mount CORS before ownership on /agents/*
+ apps/brunch-agent/test/cors.test.ts          parser, allowed, rejected, preflight, route-scope tests
~ apps/brunch-agent/README.md                  deployment variable and security boundary
~ apps/brunch-agent/turbo.json                 pass the variable into the local dev task
```

## Fog-line

- Infrastructure repository access is unavailable in this worktree, so this branch can prove only
  the application contract. The ECS task definition must supply the chosen origins before remote
  verification.
- Exact origins intentionally do not cover every random Vercel deployment URL. Use canonical
  domains and stable branch aliases; add a one-off random deployment origin only when a named test
  requires it. Re-enter constrained patterns or a same-origin proxy only if maintaining stable
  aliases becomes observed operational strain.
- The allowed and exposed headers are pinned to the installed Flue and Durable Streams clients.
  Re-evaluate them from client source when either dependency changes.

## Stop or reorient

Stop if the real browser client emits a request method or non-safelisted request header outside the
pinned contract, reads another non-safelisted response header, or needs cookie credentials. Bring
that evidence back to the contract before broadening the grant.

Stop if middleware ordering bypasses ownership for a non-`OPTIONS` request, if an invalid
configuration widens access or is ignored, if an unlisted origin receives
`Access-Control-Allow-Origin`, or if `/health`, `/`, or `/assets/*` inherit the policy.

Do not represent a green CORS test as permission for unauthenticated public exposure. Authentication,
per-conversation authorization, rate/spend controls, and the infrastructure ingress boundary remain
separate release gates.

## Deferred

- SRE-1013 owns injection of the allowlist into the Brunch ECS task. SRE-1042 owns
  `VITE_BRUNCH_CHAT_ENDPOINT`, Voice deployment variables, and the deployed browser verification
  after this application contract lands.
- FE-1615 and FE-1616 retain authentication and rate-limit work. CORS does not discharge either.
- A same-origin Petrinaut proxy or constrained preview-host pattern re-enters only under observed
  exact-list maintenance strain.
