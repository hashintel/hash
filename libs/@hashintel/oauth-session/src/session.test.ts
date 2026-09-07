import { test as propertyTest } from "@fast-check/vitest";
import * as fc from "fast-check";
import { SignJWT } from "jose";
import { describe, expect, test } from "vitest";

import {
  mintSessionToken,
  readSessionToken,
  type OAuthSessionKeyring,
} from "./session";

const keyring: OAuthSessionKeyring = {
  secret: "test-secret-that-is-long-enough-for-hs256",
  issuer: "https://petrinaut.test",
  audience: "petrinaut-ai",
};

const identity = {
  sub: "github:583231",
  provider: "github",
  login: "octocat",
  avatarUrl: "https://avatars.test/octocat.png",
};

const encoder = new TextEncoder();

/** A token signed with the real secret, so only its claims are under test. */
const signClaims = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(encoder.encode(keyring.secret));

describe("session tokens", () => {
  test("round-trips the identity a sign-in established", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    await expect(readSessionToken(keyring, token)).resolves.toMatchObject(
      identity,
    );
  });

  test("carries no expiry beyond the requested lifetime", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintSessionToken(keyring, identity, 60);
    const session = await readSessionToken(keyring, token);

    expect(session?.exp).toBeGreaterThan(before);
    expect(session?.exp).toBeLessThanOrEqual(before + 61);
  });

  test("rejects a token that renames its own algorithm to none", async () => {
    // Hand-built, because `jose` will not sign one: header and claims that a
    // verifier inferring `alg` from the token would accept with no signature.
    const unsigned =
      `${btoa(JSON.stringify({ alg: "none", typ: "JWT" }))}.${btoa(
        JSON.stringify({
          ...identity,
          iss: keyring.issuer,
          aud: keyring.audience,
          exp: Math.floor(Date.now() / 1000) + 60,
          iat: Math.floor(Date.now() / 1000),
        }),
      )}.`
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");

    await expect(readSessionToken(keyring, unsigned)).resolves.toBeNull();
  });

  test("rejects a correctly signed token that carries no expiry", async () => {
    // The highest-value case here: `exp` is enforced only when present, so
    // without `requiredClaims` this token would verify for ever.
    const token = await signClaims({
      ...identity,
      iss: keyring.issuer,
      aud: keyring.audience,
      iat: Math.floor(Date.now() / 1000),
    });

    await expect(readSessionToken(keyring, token)).resolves.toBeNull();
  });

  test("rejects an expired token", async () => {
    const token = await signClaims({
      ...identity,
      iss: keyring.issuer,
      aud: keyring.audience,
      iat: Math.floor(Date.now() / 1000) - 120,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(readSessionToken(keyring, token)).resolves.toBeNull();
  });

  test("rejects a token minted for another audience", async () => {
    const token = await mintSessionToken(
      { ...keyring, audience: "some-other-service" },
      identity,
      60,
    );

    await expect(readSessionToken(keyring, token)).resolves.toBeNull();
  });

  test("rejects a token minted by another issuer", async () => {
    const token = await mintSessionToken(
      { ...keyring, issuer: "https://evil.test" },
      identity,
      60,
    );

    await expect(readSessionToken(keyring, token)).resolves.toBeNull();
  });

  test("rejects a token signed with a different secret", async () => {
    const token = await mintSessionToken(
      { ...keyring, secret: "a-different-secret-of-sufficient-length!!" },
      identity,
      60,
    );

    await expect(readSessionToken(keyring, token)).resolves.toBeNull();
  });

  test("fails closed when the secret is missing or too short", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    // A deployment that forgot the secret must reject every session rather
    // than verify against the bytes of a short, guessable string.
    for (const secret of ["", "short", "undefined"]) {
      await expect(
        readSessionToken({ ...keyring, secret }, token),
      ).resolves.toBeNull();
    }

    await expect(
      mintSessionToken({ ...keyring, secret: "" }, identity, 60),
    ).rejects.toThrow(/at least 32 bytes/u);
  });

  test("rejects a token with any single character altered", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    for (const index of [0, 20, token.length - 1]) {
      const character = token[index] === "a" ? "b" : "a";
      const tampered = `${token.slice(0, index)}${character}${token.slice(index + 1)}`;

      await expect(readSessionToken(keyring, tampered)).resolves.toBeNull();
    }
  });

  test("treats an absent token as signed out", async () => {
    await expect(readSessionToken(keyring, null)).resolves.toBeNull();
    await expect(readSessionToken(keyring, "")).resolves.toBeNull();
  });
});

describe("session token verification, over arbitrary input", () => {
  propertyTest.prop([fc.string()])(
    "never returns a session for a string we did not mint",
    async (candidate) => {
      expect(await readSessionToken(keyring, candidate)).toBeNull();
    },
  );
});
