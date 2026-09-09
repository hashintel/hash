# Brunch remote browser-origin policy

## Status

**Historical inherited contract, preserved on the owner-authorized Voice branch transition.**
This archival does not adjudicate acceptance or close its outstanding deployment gates.
The following describes its original scope as of 2026-09-08, not this branch's execution authority.

Originally live for
[SRE-1042](https://linear.app/hash/issue/SRE-1042/configure-petrinauts-deployment-variables-for-the-brunch-agent-chat)
on `t/sre-1042-allow-wildcard-origins-for-brunch-previews`, cut from `main` after
[FE-1626](https://github.com/hashintel/hash/pull/9583) established the exact-origin allow-list for
`/agents/*`.

Exact origins alone do not fit the deployment: every Petrinaut preview has its own
`https://petrinaut-git-<branch>.stage.hash.ai` origin, so the allow-list additionally accepts a
wildcard for exactly one leading host label. CORS governs whether a conforming browser exposes a cross-origin response
to client code; it does not authenticate or restrict non-browser callers, authorize a
conversation, or make public exposure safe by itself.

## Imperative

Let a deployed Petrinaut website use the Brunch `/agents/*` Flue routes from an explicitly trusted
browser origin while causing browsers to withhold cross-origin access from unlisted origins. Do
this now because the deployed website and Brunch service are separate origins and
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

`BRUNCH_CORS_ALLOWED_ORIGINS` is read once at startup as a comma-separated list of HTTP(S)
origins, each either exact or with a wildcard as the whole leading host label in front of a domain
with at least two labels (`https://*.stage.hash.ai`). A wildcard matches exactly one label, like a
wildcard TLS certificate. Parsing trims whitespace, normalizes an optional trailing slash through
`URL.origin`, and deduplicates values. Credentials, non-root paths, queries, fragments, wildcards in
any other position, opaque origins, and non-HTTP(S) schemes are startup configuration errors. Missing or blank configuration means an
empty allowlist: same-origin and non-browser callers continue through the existing route, but
browser code at another origin receives no CORS grant. See the
[Brunch application README](../../../../../apps/brunch-agent/README.md#production-container) for
operator configuration details.

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
Non-browser callers can still send requests and receive ordinary HTTP responses because CORS is
enforced by browsers, not by the service as caller authentication. A response to an unlisted
browser origin carries no `Access-Control-Allow-Origin`, so the browser withholds that response
from client code.

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
   exact-origin configuration, empty-list behavior, and the fact that CORS governs browser access
   rather than authenticating or restricting non-browser callers. Oracle:
   `yarn workspace @apps/brunch-agent test:unit`,
   `yarn workspace @apps/brunch-agent lint:tsc`,
   `yarn workspace @apps/brunch-agent lint:eslint`, and
   `yarn workspace @apps/brunch-agent build`.

## Constraints

- Use Hono's built-in CORS middleware; do not create a parallel HTTP server or hand-maintain generic
  CORS response logic.
- Keep one Flue product route and the existing ownership guard. CORS must not add, proxy, rename, or
  reinterpret an agent route.
- The origin list is explicit: exact origins or one-label wildcards, matched by scheme, host and
  port. Do not hard-code Petrinaut domains, reflect arbitrary `Origin` values, or silently skip
  malformed entries.
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
~ apps/brunch-agent/src/http/cors.ts           exact and one-label wildcard origins, Hono middleware
~ apps/brunch-agent/src/app.ts                 mount CORS before ownership on /agents/*
+ apps/brunch-agent/test/cors.test.ts          parser, allowed, rejected, preflight, route-scope tests
~ apps/brunch-agent/README.md                  deployment variable and security boundary
~ apps/brunch-agent/turbo.json                 pass the variable into the local dev task
```

## Fog-line

- Infrastructure repository access is unavailable in this worktree, so this branch can prove only
  the application contract. Runtime deployment configuration must supply the chosen origins before
  remote verification.
- A one-label wildcard admits every host directly under the configured domain, not only Petrinaut
  previews. Narrow the deployed pattern or return to exact origins if that breadth becomes a
  problem in practice.
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

- SRE-1013 owns injection of the allowlist into the Brunch runtime deployment. SRE-1042 owns
  `VITE_BRUNCH_CHAT_ENDPOINT`, Voice deployment variables, and the deployed browser verification
  after this application contract lands.
- FE-1615 and FE-1616 retain authentication and rate-limit work. CORS does not discharge either.
- A same-origin Petrinaut proxy stays deferred; the one-label wildcard covers the preview
  deployments the exact list could not.
