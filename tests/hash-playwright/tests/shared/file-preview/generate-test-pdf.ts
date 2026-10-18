import type { PageContent } from "./test-document";

const pageHeight = 842;

/**
 * Literal strings may only hold letters, digits, spaces and full stops, because
 * ISO 32000-1 lets these appear unescaped and Helvetica draws them as in ASCII.
 *
 * @see https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf#page=23
 */
const unsupportedCharacter = /[^A-Za-z0-9 .]/;

const toLiteralString = (text: string) => {
  const match = unsupportedCharacter.exec(text);
  if (match) {
    throw new Error(
      `Cannot write "${match[0]}" in "${text}" to the PDF: page text may only hold letters, digits, spaces and full stops`,
    );
  }
  return `(${text})`;
};

const buildContentStream = ({ heading, body }: PageContent) =>
  [
    "BT",
    "/F1 32 Tf",
    `72 ${pageHeight - 108} Td`,
    `${toLiteralString(heading)} Tj`,
    "/F1 14 Tf",
    "0 -48 Td",
    `${toLiteralString(body)} Tj`,
    "ET",
  ].join("\n");

/**
 * Renders `pages` as an A4 PDF, one page per entry, in the standard Helvetica
 * font, which is not embedded. The file structure follows the "Simple Text
 * String Example" in ISO 32000-1.
 *
 * @see https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf#page=708
 */
export const generatePdf = (pages: readonly PageContent[]): Buffer => {
  // After the catalog, page tree and font
  const firstPageObjectNumber = 4;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages
      .map((_, index) => `${firstPageObjectNumber + index * 2} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const contentStream = buildContentStream(page);
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${
          firstPageObjectNumber + index * 2 + 1
        } 0 R >>`,
        `<< /Length ${Buffer.byteLength(
          contentStream,
        )} >>\nstream\n${contentStream}\nendstream`,
      ];
    }),
  ];

  let pdf = "%PDF-1.4\n";

  const objectOffsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });

  const crossReferenceOffset = Buffer.byteLength(pdf);

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of objectOffsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;

  return Buffer.from(pdf);
};
