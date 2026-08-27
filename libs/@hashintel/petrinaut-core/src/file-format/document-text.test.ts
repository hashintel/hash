import { describe, expect, it } from "vitest";

import { parseDocumentText, serializeDocument } from "./document-text";

describe("parseDocumentText", () => {
  it("parses JSON text", () => {
    expect(parseDocumentText('{ "a": 1, "b": [true, null] }')).toEqual({
      ok: true,
      data: { a: 1, b: [true, null] },
    });
  });

  it("keeps JSON.parse semantics for JSON documents (duplicate keys last-win)", () => {
    // A YAML parse of the same text would reject the duplicate key.
    expect(parseDocumentText('{ "a": 1, "a": 2 }')).toEqual({
      ok: true,
      data: { a: 2 },
    });
  });

  it("parses YAML text, including block scalars", () => {
    const result = parseDocumentText(
      [
        "# a comment",
        "title: My net",
        "code: |-",
        "  const a = 1;",
        "  return a;",
        "count: 3",
      ].join("\n"),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        title: "My net",
        code: "const a = 1;\nreturn a;",
        count: 3,
      },
    });
  });

  it("keeps YAML 1.1 boolean-like scalars as strings", () => {
    expect(parseDocumentText("name: on\nother: yes")).toEqual({
      ok: true,
      data: { name: "on", other: "yes" },
    });
  });

  it("accepts YAML flow syntax that is not valid JSON", () => {
    expect(parseDocumentText("{ a: 1 }")).toEqual({
      ok: true,
      data: { a: 1 },
    });
  });

  it("reports the JSON error for a malformed brace-leading document", () => {
    const result = parseDocumentText('{ "a": ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Not valid JSON");
    }
  });

  it("reports the YAML error for other malformed documents", () => {
    const result = parseDocumentText("a: [1,");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Not valid YAML");
    }
  });

  it("rejects empty and comment-only documents", () => {
    for (const text of ["", "   \n", "# only a comment\n"]) {
      expect(parseDocumentText(text)).toEqual({
        ok: false,
        error: "The document is empty",
      });
    }
  });
});

describe("serializeDocument", () => {
  const value = {
    title: "My net",
    numericName: "123",
    code: "const a = 1;\nreturn a;",
    nested: [{ enabled: true, weight: 1.5 }],
  };

  it("serializes JSON identically to JSON.stringify", () => {
    expect(serializeDocument(value, "json")).toBe(
      JSON.stringify(value, null, 2),
    );
  });

  it("serializes YAML that round-trips, with multi-line strings as block scalars", () => {
    const text = serializeDocument(value, "yaml");

    expect(text).toContain("code: |-");
    expect(parseDocumentText(text)).toEqual({ ok: true, data: value });
  });

  it("writes repeated objects in full instead of anchor/alias references", () => {
    const shared = { enabled: true };
    const text = serializeDocument({ first: shared, second: shared }, "yaml");

    expect(text).not.toContain("&");
    expect(text).not.toContain("*");
    expect(parseDocumentText(text)).toEqual({
      ok: true,
      data: { first: { enabled: true }, second: { enabled: true } },
    });
  });

  it("drops undefined values like JSON.stringify", () => {
    const text = serializeDocument({ a: 1, b: undefined }, "yaml");

    expect(parseDocumentText(text)).toEqual({ ok: true, data: { a: 1 } });
  });
});
