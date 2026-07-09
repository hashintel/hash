import { describe, expect, it } from "vitest";

import { isPrimaryEmailVerified } from "./create-unverified-email-cleanup-job";

import type { Identity } from "@ory/kratos-client";

/**
 * Build a minimal Kratos identity for the cleanup-job predicate. Only the
 * fields `isPrimaryEmailVerified` reads (`traits.emails`, `verifiable_addresses`)
 * are populated; the rest of the `Identity` shape is irrelevant here.
 */
const identity = (
  emails: string[],
  verifiableAddresses: Array<{ value: string; verified: boolean }>,
): Identity =>
  ({
    traits: { emails },
    verifiable_addresses: verifiableAddresses,
  }) as unknown as Identity;

describe("isPrimaryEmailVerified (cleanup-job deletion gate)", () => {
  it("treats a verified address as verified despite trait/address casing mismatch", () => {
    expect(
      isPrimaryEmailVerified(
        identity(
          ["User@Example.com"],
          [{ value: "user@example.com", verified: true }],
        ),
      ),
    ).toBe(true);
  });

  it("treats a verified address as verified when casing matches", () => {
    expect(
      isPrimaryEmailVerified(
        identity(
          ["user@example.com"],
          [{ value: "user@example.com", verified: true }],
        ),
      ),
    ).toBe(true);
  });

  it("treats a genuinely unverified address as unverified (eligible for cleanup)", () => {
    expect(
      isPrimaryEmailVerified(
        identity(
          ["User@Example.com"],
          [{ value: "user@example.com", verified: false }],
        ),
      ),
    ).toBe(false);
  });

  it("returns false when there is no verifiable address", () => {
    expect(isPrimaryEmailVerified(identity(["user@example.com"], []))).toBe(
      false,
    );
  });

  it("returns false when the identity has no email traits", () => {
    expect(
      isPrimaryEmailVerified(
        identity([], [{ value: "user@example.com", verified: true }]),
      ),
    ).toBe(false);
  });
});
