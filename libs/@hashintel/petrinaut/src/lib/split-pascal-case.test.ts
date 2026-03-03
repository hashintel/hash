import { describe, expect, it } from "vitest";

import { splitPascalCase } from "./split-pascal-case";

describe("splitPascalCase", () => {
  it("should split a simple PascalCase string into segments", () => {
    const result = splitPascalCase("HelloWorld");

    expect(result).toEqual(["Hello", "World"]);
  });

  it("should handle acronyms followed by words correctly", () => {
    const result = splitPascalCase("QAQueue");

    expect(result).toEqual(["QA", "Queue"]);
  });

  it("should handle longer acronyms", () => {
    const result = splitPascalCase("XMLHttpRequest");

    expect(result).toEqual(["XML", "Http", "Request"]);
  });

  it("should handle acronyms at the end", () => {
    const result = splitPascalCase("IOError");

    expect(result).toEqual(["IO", "Error"]);
  });

  it("should handle a single word", () => {
    const result = splitPascalCase("Hello");

    expect(result).toEqual(["Hello"]);
  });

  it("should handle multiple consecutive words", () => {
    const result = splitPascalCase("MyVeryLongClassName");

    expect(result).toEqual(["My", "Very", "Long", "Class", "Name"]);
  });

  it("should handle mixed acronyms and words", () => {
    const result = splitPascalCase("HTTPSConnection");

    expect(result).toEqual(["HTTPS", "Connection"]);
  });

  it("should handle a string ending with an acronym", () => {
    const result = splitPascalCase("ParseXML");

    expect(result).toEqual(["Parse", "XML"]);
  });

  it("should handle single uppercase letter words", () => {
    const result = splitPascalCase("AQuickTest");

    expect(result).toEqual(["A", "Quick", "Test"]);
  });

  it("should handle only uppercase letters (acronym)", () => {
    const result = splitPascalCase("HTML");

    expect(result).toEqual(["HTML"]);
  });

  it("should handle only uppercase letters (acronym) with numbers", () => {
    const result = splitPascalCase("HTML42");

    expect(result).toEqual(["HTML", "42"]);
  });

  it("should handle empty string", () => {
    const result = splitPascalCase("");

    expect(result).toEqual([""]);
  });

  it("should handle complex real-world examples", () => {
    const result = splitPascalCase("HTTPResponseCodeXML");

    expect(result).toEqual(["HTTP", "Response", "Code", "XML"]);
  });

  it("should handle UIElement pattern", () => {
    const result = splitPascalCase("UIElement");

    expect(result).toEqual(["UI", "Element"]);
  });

  it("should handle APIKey pattern", () => {
    const result = splitPascalCase("APIKey");

    expect(result).toEqual(["API", "Key"]);
  });

  it("should handle PascalCase with numbers", () => {
    const result = splitPascalCase("Space42");

    expect(result).toEqual(["Space", "42"]);
  });
});
