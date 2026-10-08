export const testPdfSearchWord = "quokka";

const pageHeight = 842;

const pageTexts: [heading: string, body: string][] = [
  ["Page 1", `A ${testPdfSearchWord} lives on this page.`],
  ["Page 2", "Nothing to find here."],
  ["Page 3", `Another ${testPdfSearchWord} lives on this page.`],
];

const buildContentStream = ([heading, body]: [string, string]) =>
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
 * Builds a three-page A4 PDF whose pages are headed "Page 1" to "Page 3".
 * `testPdfSearchWord` appears on pages 1 and 3 only. The text uses the
 * standard Helvetica font, which is not embedded.
 */
export const generateTestPdf = (): Buffer => {
  const firstPageObjectNumber = 4;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageTexts
      .map((_, index) => `${firstPageObjectNumber + index * 2} 0 R`)
      .join(" ")}] /Count ${pageTexts.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pageTexts.flatMap((texts, index) => {
      const contentStream = buildContentStream(texts);
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
