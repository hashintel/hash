import { describe, expect, it } from "vitest";

import { getClientRouteDecision } from "./client-route-guard";

import type { User } from "../../lib/user-and-org";

type RouteAuthenticatedUser = Pick<
  User,
  "accountSignupComplete" | "emails" | "enabledFeatureFlags"
>;

const createUser = (
  overrides: Partial<RouteAuthenticatedUser> = {},
): RouteAuthenticatedUser => ({
  accountSignupComplete: true,
  emails: [{ address: "user@example.com", primary: true, verified: true }],
  enabledFeatureFlags: [],
  ...overrides,
});

const getDecision = (
  overrides: Partial<Parameters<typeof getClientRouteDecision>[0]> = {},
) =>
  getClientRouteDecision({
    aal2Required: false,
    asPath: "/entities?drafts=true",
    authenticatedUser: createUser(),
    emailVerificationStatusKnown: true,
    hasAccessToHash: true,
    isInstanceAdmin: false,
    isInstanceAdminLoading: false,
    pathname: "/entities",
    ...overrides,
  });

describe("getClientRouteDecision", () => {
  it("sends a signed-out user to signin with the requested URL", () => {
    expect(getDecision({ authenticatedUser: undefined })).toEqual({
      status: "redirect",
      destination: "/signin?return_to=%2Fentities%3Fdrafts%3Dtrue",
    });
  });

  it("allows signed-out users to visit public pages", () => {
    expect(
      getDecision({ authenticatedUser: undefined, pathname: "/signin" }),
    ).toEqual({ status: "allow" });
  });

  it("waits for a signed-in user's email verification status", () => {
    expect(getDecision({ emailVerificationStatusKnown: false })).toEqual({
      status: "waiting",
    });
  });

  it("sends an unverified user to verification", () => {
    expect(
      getDecision({
        authenticatedUser: createUser({
          emails: [
            {
              address: "user@example.com",
              primary: true,
              verified: false,
            },
          ],
        }),
      }),
    ).toEqual({ status: "redirect", destination: "/verification" });
  });

  it("sends an incomplete user with access to signup", () => {
    expect(
      getDecision({
        authenticatedUser: createUser({ accountSignupComplete: false }),
      }),
    ).toEqual({ status: "redirect", destination: "/signup" });
  });

  it("sends a waitlisted user to the home page", () => {
    expect(
      getDecision({
        authenticatedUser: createUser({ accountSignupComplete: false }),
        hasAccessToHash: false,
      }),
    ).toEqual({ status: "redirect", destination: "/" });
  });

  it("allows a completed user to accept an invitation on signup", () => {
    expect(
      getDecision({
        asPath: "/signup?invitationId=invitation-id",
        pathname: "/signup",
      }),
    ).toEqual({ status: "allow" });
  });

  it("waits for admin status before deciding a hidden feature route", () => {
    expect(
      getDecision({
        isInstanceAdminLoading: true,
        pathname: "/dashboards",
      }),
    ).toEqual({ status: "waiting" });
  });

  it("allows an admin to visit a hidden feature route", () => {
    expect(
      getDecision({ isInstanceAdmin: true, pathname: "/dashboards" }),
    ).toEqual({ status: "allow" });
  });
});
