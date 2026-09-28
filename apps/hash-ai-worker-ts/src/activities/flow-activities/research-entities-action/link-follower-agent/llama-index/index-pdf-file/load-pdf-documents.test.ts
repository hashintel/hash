import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadPdfDocuments } from "./load-pdf-documents.js";

const samplePdfPath = fileURLToPath(
  new URL(
    "../../../../../shared/judge-ai-output-optimize/study_record_ISRCTN15438979_2025-01-20.pdf",
    import.meta.url,
  ),
);

describe("loadPdfDocuments", () => {
  it("returns one document per page with page metadata", async () => {
    const documents = await loadPdfDocuments(samplePdfPath);

    expect(documents.length).toBeGreaterThan(0);

    for (const [index, document] of documents.entries()) {
      expect(document.text.trim(), `page ${index + 1} has text`).not.toBe("");
      expect(document.metadata).toEqual({
        page_number: index + 1,
        total_pages: documents.length,
      });
    }

    expect(documents.map(({ text }) => text).join("\n")).toContain(
      "ISRCTN15438979",
    );
  });
});
