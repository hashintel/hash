import { randomBytes, timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { isDevEnv } from "../lib/env-config";
import { hydraAdmin } from "./ory-hydra";

const CSRF_COOKIE_NAME = "_csrf_consent";

/**
 * Parse a single cookie value from a raw Cookie header string.
 */
function parseCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(trimmed.slice(name.length + 1));
      } catch {
        // Malformed percent-encoding in the cookie value — treat as missing.
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Constant-time comparison of two CSRF token strings to prevent timing attacks.
 */
function csrfTokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Set a CSRF cookie and return the token value for embedding in the form.
 */
function generateCsrfToken(res: Parameters<RequestHandler>[1]): string {
  const token = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isDevEnv,
    sameSite: "lax",
    path: "/oauth2/consent",
  });
  return token;
}

/**
 * Clear the CSRF cookie after successful validation to prevent reuse.
 */
function clearCsrfCookie(res: Parameters<RequestHandler>[1]): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: true,
    secure: !isDevEnv,
    sameSite: "lax",
    path: "/oauth2/consent",
  });
}

/**
 * @see https://github.com/ory/hydra-login-consent-node/tree/master
 */
export const oauthConsentRequestHandler: RequestHandler<
  Record<string, never>,
  string,
  Record<string, never>,
  { consent_challenge: string }
> = (req, res, next) => {
  const query = req.query;

  // The challenge is used to fetch information about the consent request from ORY hydraAdmin.
  const consentChallenge = query.consent_challenge;
  if (!consentChallenge) {
    next(
      new Error("Expected a consent_challenge to be set but received none."),
    );
    return;
  }

  hydraAdmin
    .getOAuth2ConsentRequest({ consentChallenge })
    .then(({ data: consentRequest }) => {
      // If a user has granted this application the requested scope, hydra will tell us to not show the UI.
      if (consentRequest.skip || consentRequest.client?.skip_consent) {
        return hydraAdmin
          .acceptOAuth2ConsentRequest({
            consentChallenge,
            acceptOAuth2ConsentRequest: {
              // we can grant all scopes that have been requested - Hydra checked that no additional scopes are requested accidentally.
              grant_scope: consentRequest.requested_scope,

              // Hydra checks if requested audiences are allowed by the client, so we can simply echo this.
              grant_access_token_audience:
                consentRequest.requested_access_token_audience,
            },
          })
          .then(({ data: redirectTo }) => {
            res.redirect(redirectTo.redirect_to);
          });
      }

      if (!req.user) {
        res.status(401).send("Authentication required to grant consent.");
        return;
      }

      if (consentRequest.subject !== req.user.kratosIdentityId) {
        res
          .status(403)
          .send("Consent request subject does not match request user.");
        return;
      }

      const csrfToken = generateCsrfToken(res);

      const viewData = {
        challenge: consentChallenge,
        requested_scope: consentRequest.requested_scope,
        username: req.user.shortname,
        client: consentRequest.client,
        csrfToken,
      };

      res.setHeader("x-frame-options", "deny");
      res.render("consent", viewData);
    })
    .catch(next);
  // The consent request has now either been accepted automatically or rendered.
};

export const oauthConsentSubmissionHandler: RequestHandler = (
  req,
  res,
  next,
) => {
  if (!req.user) {
    res.status(401).send("Authentication required to grant consent.");
    return;
  }

  // Validate CSRF token (double-submit cookie pattern)
  const csrfTokenFromBody: unknown = req.body.csrfToken;
  const csrfTokenFromCookie = parseCookieValue(
    req.headers.cookie,
    CSRF_COOKIE_NAME,
  );

  if (
    typeof csrfTokenFromBody !== "string" ||
    !csrfTokenFromCookie ||
    !csrfTokensMatch(csrfTokenFromBody, csrfTokenFromCookie)
  ) {
    res.status(403).send("Invalid or missing CSRF token.");
    return;
  }

  // Clear the CSRF cookie to prevent reuse
  clearCsrfCookie(res);

  const consentChallenge = req.body.challenge;

  if (req.body.submit === "deny") {
    hydraAdmin
      .rejectOAuth2ConsentRequest({
        consentChallenge,
        rejectOAuth2Request: {
          error: "access_denied",
          error_description: "The resource owner denied the request",
        },
      })
      .then(({ data: rejection }) => {
        res.json({ redirectTo: rejection.redirect_to });
      })
      .catch(next);
    return;
  }

  let grantScope = req.body.grant_scope;
  if (!Array.isArray(grantScope)) {
    grantScope = [grantScope];
  }

  hydraAdmin
    .getOAuth2ConsentRequest({ consentChallenge })
    .then(({ data: body }) => {
      // Verify the consent request subject matches the authenticated user
      if (body.subject !== req.user?.kratosIdentityId) {
        res
          .status(403)
          .send("Consent request subject does not match authenticated user.");
        return;
      }

      return hydraAdmin
        .acceptOAuth2ConsentRequest({
          consentChallenge,
          acceptOAuth2ConsentRequest: {
            grant_scope: grantScope,
            grant_access_token_audience: body.requested_access_token_audience,

            /** Remember the user's choice (don't ask again for the same client and scope(s) */
            remember: true,
            /** Remember the user's choice indefinitely */
            remember_for: 0,
          },
        })
        .then(({ data: redirectTo }) => {
          res.json({ redirectTo: redirectTo.redirect_to });
        });
    })
    .catch(next);
};
