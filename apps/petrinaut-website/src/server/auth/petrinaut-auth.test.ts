import { describe, expect, test } from "vitest";

import {
  brunchAudience,
  petrinautAiAudience,
  resolvePetrinautAuthSettings,
} from "./petrinaut-auth";

const configured = {
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  PETRINAUT_SESSION_SECRET: "a-session-secret-of-at-least-32-bytes!!!",
  PETRINAUT_PUBLIC_ORIGIN: "https://demo.petrinaut.test",
};

describe("resolving auth settings from the environment", () => {
  test("offers GitHub sign-in when all three variables are present", () => {
    const settings = resolvePetrinautAuthSettings(configured);

    expect(settings.clients.github).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });

  test("derives the issuer and the callback from the public origin", () => {
    const settings = resolvePetrinautAuthSettings(configured);

    expect(settings.keyring.issuer).toBe("https://demo.petrinaut.test");
    expect(settings.callbackUrl).toBe(
      "https://demo.petrinaut.test/api/auth/callback",
    );
  });

  test("lands a finished sign-in on a fixed same-origin path", () => {
    // Never a value off the request: a caller-supplied destination here is an
    // open redirect, and this route is reached straight from a provider.
    expect(resolvePetrinautAuthSettings(configured).signedInPath).toBe("/");
  });

  test.each([
    ["no session secret", { ...configured, PETRINAUT_SESSION_SECRET: "" }],
    ["no client id", { ...configured, GITHUB_CLIENT_ID: undefined }],
    ["no client secret", { ...configured, GITHUB_CLIENT_SECRET: undefined }],
    ["nothing configured", {}],
  ])("offers no provider with %s", (_case, environment) => {
    // An unconfigured deployment reports sign-in unavailable rather than
    // sending anyone to a provider that would reject the request. A branch
    // preview is the ordinary example.
    expect(resolvePetrinautAuthSettings(environment).clients).toEqual({});
  });

  test("keeps the first-party and delegated audiences distinct", () => {
    // Equal audiences would make a token handed to page scripts for Brunch
    // interchangeable with the cookie session that guards Petrinaut AI.
    expect(petrinautAiAudience).not.toBe(brunchAudience);

    const settings = resolvePetrinautAuthSettings(configured);

    expect(settings.keyring.audience).toBe(petrinautAiAudience);
    expect(settings.delegation?.audience).toBe(brunchAudience);
  });

  test("expires a delegated token far sooner than the session", () => {
    const settings = resolvePetrinautAuthSettings(configured);

    expect(settings.delegation?.ttlSeconds).toBeLessThan(
      settings.sessionTtlSeconds,
    );
  });

  test("falls back to the dev origin, never to a production one", () => {
    // A missing origin must not silently mint tokens that claim to be from
    // production, so the fallback is the only origin a default build serves.
    expect(resolvePetrinautAuthSettings({}).keyring.issuer).toBe(
      "http://localhost:5173",
    );
  });
});
