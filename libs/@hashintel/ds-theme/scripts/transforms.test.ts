import { describe, expect, it } from "vitest";
import {
  cleanDescription,
  shouldSkipKey,
  transformPropertyKey,
  formatTokensForOutput,
  transformSpacingScale,
  transformRadiusScale,
  transformLineHeightReference,
  transformRadiusReference,
} from "./transforms";

describe("shouldSkipKey", () => {
  it("returns true for keys starting with hyphen", () => {
    expect(shouldSkipKey("-private")).toBe(true);
    expect(shouldSkipKey("-internal-value")).toBe(true);
  });

  it("returns true for keys starting with underscore", () => {
    expect(shouldSkipKey("_private")).toBe(true);
    expect(shouldSkipKey("_internal")).toBe(true);
  });

  it("returns false for normal keys", () => {
    expect(shouldSkipKey("default")).toBe(false);
    expect(shouldSkipKey("hover")).toBe(false);
    expect(shouldSkipKey("gray")).toBe(false);
    expect(shouldSkipKey("10")).toBe(false);
  });

  it("returns false for keys with hyphen/underscore not at start", () => {
    expect(shouldSkipKey("link-hover")).toBe(false);
    expect(shouldSkipKey("some_value")).toBe(false);
  });
});

describe("cleanDescription", () => {
  it("removes leading braced content and newlines", () => {
    expect(cleanDescription("{gray-300}\ninputs, button border")).toBe(
      "inputs, button border",
    );
  });

  it("removes leading braced content with spaces and newlines", () => {
    expect(cleanDescription("{gray-200}\ncontainer borders")).toBe(
      "container borders",
    );
  });

  it("preserves plain descriptions", () => {
    expect(cleanDescription("input:hover")).toBe("input:hover");
  });

  it("trims whitespace", () => {
    expect(cleanDescription("  some description  ")).toBe("some description");
  });

  it("handles descriptions with only braced content", () => {
    expect(cleanDescription("{gray-900}")).toBe("");
  });
});

describe("transformPropertyKey", () => {
  it("converts 'default' to 'DEFAULT'", () => {
    expect(transformPropertyKey("default")).toBe("DEFAULT");
  });

  it("leaves other keys unchanged", () => {
    expect(transformPropertyKey("hover")).toBe("hover");
    expect(transformPropertyKey("active")).toBe("active");
    expect(transformPropertyKey("subtle")).toBe("subtle");
  });
});

describe("formatTokensForOutput", () => {
  it("formats simple key-value pairs", () => {
    const result = formatTokensForOutput({ foo: { value: "bar" } });
    expect(result).toBe('{ foo: { value: "bar" } }');
  });

  it("quotes keys that are not valid identifiers", () => {
    const result = formatTokensForOutput({ "2xl": { value: "24px" } });
    expect(result).toBe('{ "2xl": { value: "24px" } }');
  });

  it("quotes keys with hyphens", () => {
    const result = formatTokensForOutput({ "text-sm": { value: "14px" } });
    expect(result).toBe('{ "text-sm": { value: "14px" } }');
  });

  it("handles numeric values", () => {
    const result = formatTokensForOutput({ weight: { value: 500 } });
    expect(result).toBe("{ weight: { value: 500 } }");
  });

  it("handles nested objects", () => {
    const result = formatTokensForOutput({
      spacing: { default: { "0": { value: "0px" } } },
    });
    expect(result).toBe('{ spacing: { default: { "0": { value: "0px" } } } }');
  });

  it("handles arrays", () => {
    const result = formatTokensForOutput({ items: [1, 2, 3] });
    expect(result).toBe("{ items: [1, 2, 3] }");
  });

  it("handles undefined values", () => {
    const result = formatTokensForOutput({ foo: undefined });
    expect(result).toBe("{ foo: undefined }");
  });

  it("handles null values", () => {
    const result = formatTokensForOutput({ foo: null });
    expect(result).toBe("{ foo: null }");
  });
});

describe("transformSpacingScale", () => {
  it("adds px suffix to numeric values", () => {
    const result = transformSpacingScale({
      "0": { value: 0 },
      "1": { value: 4 },
      "2": { value: 8 },
    });
    expect(result).toEqual({
      "0": { value: "0px" },
      "1": { value: "4px" },
      "2": { value: "8px" },
    });
  });

  it("handles empty scale", () => {
    const result = transformSpacingScale({});
    expect(result).toEqual({});
  });

  it("skips keys starting with hyphen or underscore", () => {
    const result = transformSpacingScale({
      "0": { value: 0 },
      "-private": { value: 10 },
      "_internal": { value: 20 },
      "1": { value: 4 },
    });
    expect(result).toEqual({
      "0": { value: "0px" },
      "1": { value: "4px" },
    });
  });
});

describe("transformRadiusScale", () => {
  it("adds px suffix to numeric values", () => {
    const result = transformRadiusScale({
      "1": { value: 2 },
      "2": { value: 4 },
    });
    expect(result).toEqual({
      "1": { value: "2px" },
      "2": { value: "4px" },
    });
  });

  it("handles 9999 as pill radius", () => {
    const result = transformRadiusScale({
      full: { value: 9999 },
    });
    expect(result).toEqual({
      full: { value: "9999px" },
    });
  });

  it("preserves string references unchanged", () => {
    const result = transformRadiusScale({
      sm: { value: "{radius.4}" },
    });
    expect(result).toEqual({
      sm: { value: "{radius.4}" },
    });
  });

  it("skips keys starting with hyphen or underscore", () => {
    const result = transformRadiusScale({
      "1": { value: 2 },
      "-private": { value: 10 },
      "_internal": { value: 20 },
      full: { value: 9999 },
    });
    expect(result).toEqual({
      "1": { value: "2px" },
      full: { value: "9999px" },
    });
  });
});

describe("transformLineHeightReference", () => {
  it("converts size references to fontSizes references", () => {
    expect(transformLineHeightReference("{size.3xl}")).toBe("{fontSizes.3xl}");
    expect(transformLineHeightReference("{size.sm}")).toBe("{fontSizes.sm}");
  });

  it("adds px suffix to numeric values", () => {
    expect(transformLineHeightReference(24)).toBe("24px");
  });

  it("handles non-reference strings unchanged", () => {
    expect(transformLineHeightReference("normal")).toBe("normal");
  });
});

describe("transformRadiusReference", () => {
  it("converts radius references to radii.md references", () => {
    expect(transformRadiusReference("{radius.4}")).toBe("{radii.md.4}");
    expect(transformRadiusReference("{radius.10}")).toBe("{radii.md.10}");
  });

  it("adds px suffix to numeric values", () => {
    expect(transformRadiusReference(8)).toBe("8px");
  });

  it("handles non-reference strings unchanged", () => {
    expect(transformRadiusReference("{some.other.ref}")).toBe(
      "{some.other.ref}",
    );
  });
});
