# @hashintel/oauth-session

OAuth sign-in and stateless signed sessions, for services that need to know
which account is calling.

Nothing is stored. A session is a signed token in an `HttpOnly` cookie, and the
OAuth `state` and PKCE verifier travel in a short-lived cookie of their own, so
a deployment whose instances share no memory can still complete a sign-in.

No React, no HTTP framework, no database. Handlers take a `Request` and return
a `Response`.

## Guarding a route

A service that only checks sessions needs a secret, an issuer and an audience —
never the provider credentials, so it cannot start a sign-in of its own.

```ts
import { createSessionGuard } from "@hashintel/oauth-session";

const requireSignedIn = createSessionGuard({
  keyring: { secret, issuer, audience: "your-service" },
  message: "Sign in to continue",
});

export default {
  fetch: requireSignedIn(async (request, session) => {
    // `session.sub` is the provider-scoped account id
  }),
};
```

`readSession` accepts either a cookie or an `Authorization: Bearer` token, so a
service on another origin — which a `SameSite=Lax` cookie never reaches — reads
a token the page fetched for it instead.

## Serving sign-in

One service owns the flow and holds the provider credentials.

```ts
import { createOAuthSessionHandlers } from "@hashintel/oauth-session";

const handlers = createOAuthSessionHandlers({
  settings: {
    keyring: { secret, issuer, audience: "your-service" },
    sessionTtlSeconds: 8 * 60 * 60,
    callbackUrl: `${issuer}/api/auth/callback`,
    signedInPath: "/",
    clients: { github: { clientId, clientSecret } },
  },
});
```

The five handlers — `start`, `callback`, `session`, `logout` and
`delegatedToken` — are mounted by the host at whatever paths it serves.

## Providers

A provider is data: the endpoints, the scope to ask for, and a function reading
an account out of the profile response. `providers.ts` holds them; the flow and
the handlers never name one. GitHub is the only entry today.

Scopes are empty where the provider allows it. The profile endpoint still
identifies the account, so an access token that leaked between the exchange and
the profile read grants its holder nothing.

## What a session does not do

Revocation. A token verifies until it expires, so signing out ends one
browser's session and leaves any token already issued working. Rotating the
signing secret invalidates every session at once and is the only lever that
acts sooner than expiry.
