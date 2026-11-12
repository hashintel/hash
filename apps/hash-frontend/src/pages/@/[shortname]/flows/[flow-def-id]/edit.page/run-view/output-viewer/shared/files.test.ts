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
  it("shows a file by its MIME type, and any other file by its name", () => {
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
    expect(
      getFilePreviewKind(
        file({ fileName: "suppliers.csv", mimeType: "text/csv" }),
      ),
    ).toBe("other");
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
});

describe("getFileSteps", () => {
  it("steps between a list's files, passing over its other entities and stopping at its first and last files", () => {
    /* A file, an entity, a file, an entity that couldn't be loaded, then a file. */
    const files = [true, false, true, false, true];

    expect(getFileSteps(files, 2)).toEqual({
      position: 2,
      count: 3,
      previous: 0,
      next: 4,
    });
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
});
