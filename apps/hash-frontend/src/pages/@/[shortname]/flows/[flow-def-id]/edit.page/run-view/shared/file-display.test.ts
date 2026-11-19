import { describe, expect, it } from "vitest";

import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { formatFileSize, getFileMeta } from "./file-display";

import type { PropertyObject } from "@blockprotocol/type-system";

const file = ({
  fileName,
  mimeType,
  fileSize,
}: {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}): PropertyObject => ({
  [blockProtocolPropertyTypes.fileUrl.propertyTypeBaseUrl]:
    "https://files.example.com/file",
  ...(fileName
    ? { [blockProtocolPropertyTypes.fileName.propertyTypeBaseUrl]: fileName }
    : {}),
  ...(mimeType
    ? { [blockProtocolPropertyTypes.mimeType.propertyTypeBaseUrl]: mimeType }
    : {}),
  ...(fileSize !== undefined
    ? { [blockProtocolPropertyTypes.fileSize.propertyTypeBaseUrl]: fileSize }
    : {}),
});

describe("formatFileSize", () => {
  it("names a size in the largest unit it fills, to one decimal place", () => {
    expect(formatFileSize(1)).toBe("1 byte");
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(1000)).toBe("1 KB");
    expect(formatFileSize(820_000)).toBe("820 KB");
    expect(formatFileSize(1_234_567)).toBe("1.2 MB");
    expect(formatFileSize(3_000_000_000)).toBe("3 GB");
  });

  it("stops at gigabytes", () => {
    expect(formatFileSize(4_200_000_000_000)).toBe("4,200 GB");
  });
});

describe("getFileMeta", () => {
  it("gives a file's type and size", () => {
    expect(
      getFileMeta(
        file({
          fileName: "certificate.pdf",
          mimeType: "application/pdf",
          fileSize: 1_234_567,
        }),
      ),
    ).toBe("PDF · 1.2 MB");
  });

  it("takes the type from the name's extension, else the MIME type", () => {
    expect(getFileMeta(file({ fileName: "letter.Docx" }))).toBe("DOCX");
    expect(getFileMeta(file({ fileName: "scan", mimeType: "image/png" }))).toBe(
      "PNG",
    );
  });

  it("says only that it's a file when neither names a type", () => {
    expect(
      getFileMeta(
        file({
          fileName: "letter",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileSize: 2_000,
        }),
      ),
    ).toBe("File · 2 KB");
    expect(getFileMeta(file({}))).toBe("File");
  });
});
