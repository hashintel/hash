import type { RequestHandler } from "express";

import { hydraAdmin } from "./ory-hydra";

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

      if (consentRequest.subject !== req.user?.kratosIdentityId) {
        res
          .status(403)
          .send("Consent request subject does not match request user.");
      }

      const viewData = {
        challenge: consentChallenge,
        requested_scope: consentRequest.requested_scope,
        username: req.user?.shortname,
        client: consentRequest.client,
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
