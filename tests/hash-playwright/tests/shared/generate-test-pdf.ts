import { testDocumentPages } from "./test-document";

const pageHeight = 842;

const buildContentStream = ({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) =>
  [
    "BT",
    "/F1 32 Tf",
    `72 ${pageHeight - 108} Td`,
    `(${heading}) Tj`,
    "/F1 14 Tf",
    "0 -48 Td",
    `(${body}) Tj`,
    "ET",
  ].join("\n");

/**
 * Renders `testDocumentPages` as an A4 PDF, one page per entry, in the
 * standard Helvetica font, which is not embedded.
 */
export const generateTestPdf = (): Buffer => {
  const firstPageObjectNumber = 4;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${testDocumentPages
      .map((_, index) => `${firstPageObjectNumber + index * 2} 0 R`)
      .join(" ")}] /Count ${testDocumentPages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...testDocumentPages.flatMap((pageText, index) => {
      const contentStream = buildContentStream(pageText);
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${firstPageObjectNumber + index * 2 + 1} 0 R >>`,
        `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      ];
    }),
  ];

  let pdf = "%PDF-1.4\n";

  const objectOffsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });

  const crossReferenceOffset = pdf.length;

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of objectOffsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;

  /** Every character is ASCII, so string offsets equal byte offsets */
  return Buffer.from(pdf, "latin1");
};
