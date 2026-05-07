import { describe, expect, it } from "vitest";

import {
  filePathToUri,
  getDocumentUri,
  parseDocumentUri,
  uriToFilePath,
} from "./document-uris";

describe("getDocumentUri", () => {
  it("builds a transition-lambda URI", () => {
    expect(getDocumentUri("transition-lambda", "t1")).toBe(
      "inmemory://sdcpn/transitions/t1/lambda.ts",
    );
  });

  it("builds a transition-kernel URI", () => {
    expect(getDocumentUri("transition-kernel", "t1")).toBe(
      "inmemory://sdcpn/transitions/t1/kernel.ts",
    );
  });

  it("builds a differential-equation URI", () => {
    expect(getDocumentUri("differential-equation", "de1")).toBe(
      "inmemory://sdcpn/differential-equations/de1.ts",
    );
  });
});

describe("parseDocumentUri", () => {
  it("parses a transition-lambda URI", () => {
    expect(
      parseDocumentUri("inmemory://sdcpn/transitions/t1/lambda.ts"),
    ).toEqual({ itemType: "transition-lambda", itemId: "t1" });
  });

  it("parses a transition-kernel URI", () => {
    expect(
      parseDocumentUri("inmemory://sdcpn/transitions/t1/kernel.ts"),
    ).toEqual({ itemType: "transition-kernel", itemId: "t1" });
  });

  it("parses a differential-equation URI", () => {
    expect(
      parseDocumentUri("inmemory://sdcpn/differential-equations/de1.ts"),
    ).toEqual({ itemType: "differential-equation", itemId: "de1" });
  });

  it("returns null for an unknown URI", () => {
    expect(parseDocumentUri("inmemory://sdcpn/unknown/foo.ts")).toBeNull();
  });

  it("returns null for a completely unrelated string", () => {
    expect(parseDocumentUri("https://example.com")).toBeNull();
  });
});

describe("uriToFilePath", () => {
  it("converts a transition-lambda URI to a file path", () => {
    expect(uriToFilePath("inmemory://sdcpn/transitions/t1/lambda.ts")).toBe(
      "/transitions/t1/lambda/code.ts",
    );
  });

  it("converts a transition-kernel URI to a file path", () => {
    expect(uriToFilePath("inmemory://sdcpn/transitions/t1/kernel.ts")).toBe(
      "/transitions/t1/kernel/code.ts",
    );
  });

  it("converts a differential-equation URI to a file path", () => {
    expect(
      uriToFilePath("inmemory://sdcpn/differential-equations/de1.ts"),
    ).toBe("/differential_equations/de1/code.ts");
  });

  it("returns null for an unknown URI", () => {
    expect(uriToFilePath("inmemory://sdcpn/unknown/foo.ts")).toBeNull();
  });
});

describe("filePathToUri", () => {
  it("converts a transition-lambda file path to a URI", () => {
    expect(filePathToUri("/transitions/t1/lambda/code.ts")).toBe(
      "inmemory://sdcpn/transitions/t1/lambda.ts",
    );
  });

  it("converts a transition-kernel file path to a URI", () => {
    expect(filePathToUri("/transitions/t1/kernel/code.ts")).toBe(
      "inmemory://sdcpn/transitions/t1/kernel.ts",
    );
  });

  it("converts a differential-equation file path to a URI", () => {
    expect(filePathToUri("/differential_equations/de1/code.ts")).toBe(
      "inmemory://sdcpn/differential-equations/de1.ts",
    );
  });

  it("returns null for an unknown file path", () => {
    expect(filePathToUri("/unknown/foo/code.ts")).toBeNull();
  });
});

describe("roundtrip", () => {
  const cases = [
    { itemType: "transition-lambda" as const, itemId: "t1" },
    { itemType: "transition-kernel" as const, itemId: "t2" },
    { itemType: "differential-equation" as const, itemId: "de1" },
  ];

  it.for(cases)(
    "URI → filePath → URI roundtrips for $itemType",
    ({ itemType, itemId }) => {
      const uri = getDocumentUri(itemType, itemId);
      const filePath = uriToFilePath(uri);
      expect(filePath).not.toBeNull();
      expect(filePathToUri(filePath!)).toBe(uri);
    },
  );

  it.for(cases)(
    "URI → parse → rebuild roundtrips for $itemType",
    ({ itemType, itemId }) => {
      const uri = getDocumentUri(itemType, itemId);
      const parsed = parseDocumentUri(uri);
      expect(parsed).not.toBeNull();
      expect(getDocumentUri(parsed!.itemType, parsed!.itemId)).toBe(uri);
    },
  );
});
