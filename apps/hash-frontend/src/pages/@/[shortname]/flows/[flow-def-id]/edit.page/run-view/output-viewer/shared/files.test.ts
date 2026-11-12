import { describe, expect, it } from "vitest";

import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFilePreviewKind, getFileSteps } from "./files";

import type { PropertyObject } from "@blockprotocol/type-system";

const file = ({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType?: string;
}): PropertyObject => ({
  [blockProtocolPropertyTypes.fileUrl.propertyTypeBaseUrl]:
    `https://files.example.com/${fileName}`,
  [blockProtocolPropertyTypes.fileName.propertyTypeBaseUrl]: fileName,
  ...(mimeType
    ? { [blockProtocolPropertyTypes.mimeType.propertyTypeBaseUrl]: mimeType }
    : {}),
});

describe("getFilePreviewKind", () => {
  it("shows a file by its MIME type", () => {
    expect(
      getFilePreviewKind(file({ fileName: "scan", mimeType: "image/png" })),
    ).toBe("image");
    expect(
      getFilePreviewKind(
        file({ fileName: "certificate", mimeType: "application/pdf" }),
      ),
    ).toBe("pdf");
    expect(
      getFilePreviewKind(
        file({
          fileName: "letter",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    ).toBe("docx");
  });

  it("shows a PDF or a Word document without a MIME type by its name's extension", () => {
    expect(getFilePreviewKind(file({ fileName: "certificate.pdf" }))).toBe(
      "pdf",
    );
    expect(getFilePreviewKind(file({ fileName: "Letter.DOCX" }))).toBe("docx");
  });

  it("shows an image as an image, whatever its name says", () => {
    expect(
      getFilePreviewKind(
        file({ fileName: "scan.pdf", mimeType: "image/jpeg" }),
      ),
    ).toBe("image");
  });

  it("shows any other file by its name", () => {
    expect(
      getFilePreviewKind(
        file({ fileName: "suppliers.csv", mimeType: "text/csv" }),
      ),
    ).toBe("other");
  });
});

describe("getFileSteps", () => {
  /* A file, an entity, a file, an entity that couldn't be loaded, then a file. */
  const files = [true, false, true, false, true];

  it("steps between a list's files, passing over its other entities", () => {
    expect(getFileSteps(files, 2)).toEqual({
      position: 2,
      count: 3,
      previous: 0,
      next: 4,
    });
  });

  it("stops at the list's first and last files", () => {
    expect(getFileSteps(files, 0)).toMatchObject({
      position: 1,
      previous: null,
      next: 2,
    });
    expect(getFileSteps(files, 4)).toMatchObject({
      position: 3,
      previous: 2,
      next: null,
    });
  });

  it("goes nowhere from what isn't a file, e.g. while the list is loading", () => {
    expect(getFileSteps([false, false, false], 1)).toEqual({
      position: null,
      count: 0,
      previous: null,
      next: null,
    });
  });
});
