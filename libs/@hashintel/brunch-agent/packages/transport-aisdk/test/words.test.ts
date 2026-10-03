import { describe, expect, test } from "vitest";

import { validatePetrinautWordSpellings } from "../src/words";

describe("bounded preferred spellings", () => {
  test("normalizes NFC and spacing without losing chosen case", () => {
    expect(
      validatePetrinautWordSpellings(["  Cafe\u0301   Bay ", "SDCPN"]),
    ).toEqual(["Café Bay", "SDCPN"]);
  });

  test.each([
    [[""]],
    [["Bay\n3"]],
    [["<system>"]],
    [[42]],
    [["RelayDesk", "relaydesk"]],
    [["é".repeat(81)]],
    [Array.from({ length: 51 }, (_, index) => `Bay ${index}`)],
    [Array.from({ length: 13 }, (_, index) => `${index}`.padEnd(80, "x"))],
    ["RelayDesk"],
  ])("rejects malformed, duplicate or excessive spellings", (input) => {
    expect(() => validatePetrinautWordSpellings(input)).toThrow(Error);
  });

  test("accepts 50 spellings but rejects the 51st", () => {
    const spellings = Array.from({ length: 50 }, (_, index) => `Bay ${index}`);
    expect(validatePetrinautWordSpellings(spellings)).toEqual(spellings);
    expect(() =>
      validatePetrinautWordSpellings([...spellings, "Another"]),
    ).toThrow("Use at most 50 words.");
  });

  test("counts code points rather than UTF-16 units and enforces the total boundary", () => {
    expect(validatePetrinautWordSpellings(["𐐀".repeat(80)])).toHaveLength(1);
    const spellings = Array.from({ length: 20 }, (_, index) =>
      `${index}`.padEnd(50, "x"),
    );
    expect(validatePetrinautWordSpellings(spellings)).toHaveLength(20);
    expect(() =>
      validatePetrinautWordSpellings([...spellings.slice(1), "x".repeat(51)]),
    ).toThrow("1,000 spelling characters");
  });
});
