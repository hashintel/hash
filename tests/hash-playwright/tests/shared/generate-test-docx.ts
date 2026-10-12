import { crc32 } from "node:zlib";

import { testDocumentPages } from "./test-document";

type ZipEntry = { name: string; contents: string };

/**
 * Writes a ZIP archive whose entries are stored uncompressed, which is all a
 * DOCX reader needs.
 */
const writeStoredZip = (entries: ZipEntry[]): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.contents, "utf8");
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, data);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationshipNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationshipTypes =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

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
}): Buffer =>
  writeStoredZip([
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
      contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${wordNamespace}" xmlns:r="${relationshipNamespace}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    },
    ...extraParts,
  ]);

const paragraph = (text: string) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/** Renders `testDocumentPages` as a DOCX, one page per entry. */
export const generateTestDocx = (): Buffer =>
  writeDocx({
    body: testDocumentPages
      .map(({ heading, body }) => `${paragraph(heading)}${paragraph(body)}`)
      .join(pageBreak),
  });

/**
 * Builds a DOCX that tries to make the preview run or load something: a
 * `javascript:` link, a `data:` link, body text that looks like an HTML tag
 * with an event handler, a picture linked from another origin, and an HTML
 * altChunk holding a script.
 */
export const generateHostileTestDocx = (): Buffer =>
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
export const generateUndrawableTestDocx = (): Buffer =>
  writeDocx({
    body: [
      paragraph("Undrawable document"),
      `<w:bookmarkEnd w:id="12"/>`,
      paragraph("After the broken bookmark"),
    ].join(""),
  });
