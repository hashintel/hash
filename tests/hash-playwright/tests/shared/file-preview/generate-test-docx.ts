import JSZip from "jszip";

import type { PageContent } from "./test-document";

type ZipEntry = { name: string; contents: string };

const writeZip = (entries: ZipEntry[]): Promise<Buffer> => {
  const zip = new JSZip();
  for (const { name, contents } of entries) {
    zip.file(name, contents);
  }
  return zip.generateAsync({ type: "nodebuffer" });
};

const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationshipNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationshipTypes =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * A4 (210 by 297 mm) with one-inch margins, in twentieths of a point.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.pagesize
 * @see https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.pagemargin
 */
const sectionProperties = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

const writeDocx = ({
  body,
  documentRelationships = [],
  extraParts = [],
  extraContentTypes = "",
}: {
  body: string;
  documentRelationships?: string[];
  extraParts?: ZipEntry[];
  extraContentTypes?: string;
}): Promise<Buffer> =>
  writeZip([
    {
      name: "[Content_Types].xml",
      contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${extraContentTypes}</Types>`,
    },
    {
      name: "_rels/.rels",
      contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipTypes}/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships.join("")}</Relationships>`,
    },
    {
      name: "word/document.xml",
      contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${wordNamespace}" xmlns:r="${relationshipNamespace}"><w:body>${body}${sectionProperties}</w:body></w:document>`,
    },
    ...extraParts,
  ]);

const paragraph = (text: string) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/** Renders `pages` as a DOCX, one page per entry. */
export const generateDocx = (pages: readonly PageContent[]): Promise<Buffer> =>
  writeDocx({
    body: pages
      .map(({ heading, body }) => `${paragraph(heading)}${paragraph(body)}`)
      .join(pageBreak),
  });

/**
 * Builds a DOCX that tries to make the preview run or load something: a
 * `javascript:` link, a `data:` link, body text that looks like an HTML tag
 * with an event handler, a picture linked from another origin, and an HTML
 * altChunk holding a script.
 */
export const generateHostileTestDocx = (): Promise<Buffer> =>
  writeDocx({
    body: [
      paragraph("Hostile document"),
      `<w:p><w:hyperlink r:id="rIdJs"><w:r><w:t>javascript link</w:t></w:r></w:hyperlink></w:p>`,
      `<w:p><w:hyperlink r:id="rIdData"><w:r><w:t>data link</w:t></w:r></w:hyperlink></w:p>`,
      paragraph("&lt;img src=x onerror=alert(1)&gt;"),
      `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Remote picture"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Remote picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:link="rIdImage"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
      `<w:altChunk r:id="rIdChunk"/>`,
    ].join(""),
    documentRelationships: [
      `<Relationship Id="rIdJs" Type="${relationshipTypes}/hyperlink" Target="javascript:alert(document.domain)" TargetMode="External"/>`,
      `<Relationship Id="rIdData" Type="${relationshipTypes}/hyperlink" Target="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;" TargetMode="External"/>`,
      `<Relationship Id="rIdImage" Type="${relationshipTypes}/image" Target="https://example.org/picture.png" TargetMode="External"/>`,
      `<Relationship Id="rIdChunk" Type="${relationshipTypes}/aFChunk" Target="chunk.html"/>`,
    ],
    extraParts: [
      {
        name: "word/chunk.html",
        contents: `<html><body><p>Chunk</p><script>alert(1)</script><img src="https://example.org/chunk.png" onerror="alert(2)"></body></html>`,
      },
    ],
    extraContentTypes: `<Override PartName="/word/chunk.html" ContentType="text/html"/>`,
  });

/**
 * Builds a DOCX that folio refuses to draw: a bookmark that ends between
 * paragraphs without having started.
 */
export const generateUndrawableTestDocx = (): Promise<Buffer> =>
  writeDocx({
    body: [
      paragraph("Undrawable document"),
      `<w:bookmarkEnd w:id="12"/>`,
      paragraph("After the broken bookmark"),
    ].join(""),
  });
