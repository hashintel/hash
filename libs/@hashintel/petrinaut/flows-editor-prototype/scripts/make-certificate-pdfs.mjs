/**
 * MOCK: writes the demo ISO 9001 certificates to public/files, one A4 PDF per
 * certificate the prototype shows. Reads the certificates from the running dev
 * server, so the files say what the rows say.
 *
 *   node scripts/make-certificate-pdfs.mjs [http://localhost:6011]
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const origin = process.argv[2] ?? "http://localhost:6011";
const outDir = fileURLToPath(new URL("../public/files/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const towns = [
  ["Unit 4, Brindley Road", "Sheffield", "S9 1RL"],
  ["Riverside Works, Mill Lane", "Leeds", "LS10 2DA"],
  ["12 Harbour Way", "Bristol", "BS1 6UF"],
  ["Plot 7, Tameside Park", "Manchester", "M34 3QS"],
  ["Kiln House, Station Road", "Stoke-on-Trent", "ST4 2AR"],
  ["3 Foundry Close", "Coventry", "CV3 4LB"],
];

const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );

const html = (cert) => {
  const [street, town, postcode] = towns[cert.item % towns.length];
  const issued = cert.validUntil.replace(/\d{4}$/, (year) => year - 3);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1f2328; }
  .sheet { position: relative; width: 210mm; height: 297mm; padding: 16mm 18mm 14mm; }
  .frame { position: absolute; inset: 9mm; border: 0.6mm solid #1d3557; }
  .frame::after { content: ""; position: absolute; inset: 1.6mm; border: 0.25mm solid #1d3557; }
  .head { position: relative; display: flex; justify-content: space-between; align-items: flex-start; }
  .mark { display: flex; align-items: center; gap: 4mm; }
  .seal { width: 15mm; height: 15mm; border-radius: 50%; border: 0.6mm solid #1d3557; display: flex; align-items: center; justify-content: center; font: 600 13pt Georgia, serif; color: #1d3557; }
  .issuer { font: 600 14pt Georgia, serif; color: #1d3557; }
  .issuer small { display: block; font: 400 8.5pt "Helvetica Neue", Arial, sans-serif; color: #57606a; margin-top: 1mm; }
  .ref { text-align: right; font-size: 8.5pt; color: #57606a; line-height: 1.5; }
  .ref b { color: #1f2328; }
  h1 { position: relative; margin-top: 18mm; text-align: center; font: 400 30pt Georgia, serif; letter-spacing: 0.04em; color: #1d3557; }
  .std { position: relative; text-align: center; margin-top: 3mm; font-size: 12pt; letter-spacing: 0.08em; text-transform: uppercase; color: #3d4752; }
  .lead { position: relative; text-align: center; margin-top: 14mm; font-size: 11pt; color: #3d4752; }
  .who { position: relative; text-align: center; margin-top: 5mm; font: 600 22pt Georgia, serif; }
  .addr { position: relative; text-align: center; margin-top: 2.5mm; font-size: 10.5pt; color: #3d4752; line-height: 1.5; }
  .body { position: relative; margin: 10mm auto 0; width: 150mm; text-align: center; font-size: 11pt; line-height: 1.6; color: #1f2328; }
  .scope { position: relative; margin: 8mm auto 0; width: 150mm; padding: 4mm 6mm; background: #f3f5f8; border-left: 1mm solid #1d3557; font-size: 10.5pt; line-height: 1.55; }
  .scope b { display: block; font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #57606a; margin-bottom: 1mm; }
  table { position: relative; margin: 10mm auto 0; width: 150mm; border-collapse: collapse; font-size: 10.5pt; }
  td { padding: 2.4mm 0; border-bottom: 0.2mm solid #d0d7de; }
  td:first-child { color: #57606a; width: 60mm; }
  td:last-child { font-weight: 600; }
  .sign { position: absolute; left: 30mm; right: 30mm; bottom: 34mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig { width: 62mm; text-align: center; font-size: 9pt; color: #57606a; }
  .sig i { display: block; font: italic 18pt "Snell Roundhand", "Apple Chancery", cursive; color: #1d3557; border-bottom: 0.25mm solid #57606a; padding-bottom: 1mm; margin-bottom: 1.5mm; }
  .stamp { width: 28mm; height: 28mm; border-radius: 50%; border: 0.5mm solid #1d3557; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 6.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #1d3557; line-height: 1.4; }
  .foot { position: absolute; left: 18mm; right: 18mm; bottom: 15mm; font-size: 7.5pt; line-height: 1.5; color: #6e7781; text-align: center; }
</style></head><body><div class="sheet">
  <div class="frame"></div>
  <div class="head">
    <div class="mark"><div class="seal">${escape(cert.issuerShort.slice(0, 2))}</div>
      <div class="issuer">${escape(cert.issuer)}<small>Management systems certification</small></div></div>
    <div class="ref">Certificate no.<br><b>${escape(cert.certNo)}</b></div>
  </div>
  <h1>Certificate of Approval</h1>
  <div class="std">ISO 9001:2015 · Quality management system</div>
  <div class="lead">This is to certify that the quality management system of</div>
  <div class="who">${escape(cert.supplier)} Ltd</div>
  <div class="addr">${escape(street)}, ${escape(town)} ${escape(postcode)}, United Kingdom</div>
  <div class="body">has been assessed by ${escape(cert.issuer)} and found to conform to the requirements of ISO 9001:2015.</div>
  <div class="scope"><b>Scope of approval</b>The design, manufacture and supply of ${escape(cert.scope)}, including incoming inspection, batch traceability and dispatch.</div>
  <table>
    <tr><td>Certificate number</td><td>${escape(cert.certNo)}</td></tr>
    <tr><td>Original approval</td><td>${escape(cert.approved)}</td></tr>
    <tr><td>Current certificate issued</td><td>${escape(issued)}</td></tr>
    <tr><td>Valid until</td><td>${escape(cert.validUntil)}</td></tr>
  </table>
  <div class="sign">
    <div class="sig"><i>J. Whitfield</i>Jane Whitfield · Head of Certification<br>for and on behalf of ${escape(cert.issuer)}</div>
    <div class="stamp">${escape(cert.issuerShort)}<br>Certified<br>ISO 9001</div>
  </div>
  <div class="foot">This certificate remains valid subject to satisfactory surveillance audits. Its validity can be checked with ${escape(cert.issuer)} by quoting the certificate number above.<br>MOCK document made for the HASH Flows prototype.</div>
</div></body></html>`;
};

const kestrel = (fileName, validUntil, approved, certNo) => ({
  supplier: "Kestrel Alloys",
  item: 7,
  fileName,
  issuer: "Lloyd's Register",
  issuerShort: "LR",
  certNo,
  approved,
  validUntil,
  scope: "aluminium and titanium alloys",
});

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(origin);
const fromApp = await page.evaluate(async () => {
  const { suppliers } = await import("/src/run-history.ts");
  const { certificateOf } = await import("/src/run-outputs.tsx");
  return suppliers.map((name, item) => certificateOf(name, item));
});
const certificates = [
  kestrel("kestrel-alloys_iso-9001_2026.pdf", "14 Mar 2029", "14 Mar 2026", "LR23/51296"),
  kestrel("kestrel-alloys_iso-9001_2025.pdf", "2 Feb 2026", "2 Feb 2023", "LR21/38817"),
  ...fromApp,
];
for (const cert of certificates) {
  await page.setContent(html(cert), { waitUntil: "load" });
  await page.pdf({
    path: `${outDir}${cert.fileName}`,
    format: "A4",
    printBackground: true,
  });
  console.log(cert.fileName);
}
await browser.close();
