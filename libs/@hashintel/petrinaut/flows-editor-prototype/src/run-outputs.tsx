/**
 * What a step produced in a run, and the viewer that opens it (4 Nov call: "each node's outputs show in that node's
 * right panel, with click-through to the artifact, inline where possible, else link out", Dora [29:11]–[35:49]).
 *
 * - Entities ("20 suppliers") open a table of those entities.
 * - Files (certificates, emails) show Slack-style previews: a drawn first page, the name and a meta line. Clicking one
 *   opens a large preview with ← → between files and the file's facts beside it.
 * - The History table's Outputs column opens the same viewer.
 *
 * The step-outputs takes (Figma 1223:113791, inbox `picks/step-outputs`), picked with ?stepoutputs=a..d from the URL
 * only; no param is A, the inbox row's recommendation (no choice yet).
 * A. File rows with thumbnails; failures first.
 * B. A 2 × 2 grid of larger page previews, like several files in one Slack message.
 * C. The first file previewed large, the rest as rows; failures after.
 * D. Outputs grouped by type: files, updated entities, text, a table.
 *
 * MOCK: no flow runs and no files exist; the certificates and emails are drawn from the seed suppliers.
 */
import { Fragment, useState } from "react";

import { Button, Dialog, Icon, type IconName } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useLocation } from "./router";
import { RunGlyph } from "./run-glyph";
import {
  clockPlus,
  factsOf,
  forEachId,
  type RunRecord,
  stageSpan,
  suppliers,
} from "./run-history";

/* ----------------------------------------------------------------------------------------------------------------
 * The take
 * ------------------------------------------------------------------------------------------------------------- */

export type StepOutputsTake = "a" | "b" | "c" | "d";

/** ?stepoutputs=a..d; the inbox row has no choice yet, so its recommended take (A) is the default. */
export const useStepOutputsTake = (): StepOutputsTake => {
  const value = useLocation().query.get("stepoutputs")?.toLowerCase();
  return value === "b" || value === "c" || value === "d" ? value : "a";
};

/* ----------------------------------------------------------------------------------------------------------------
 * MOCK outputs, from the seed suppliers
 * ------------------------------------------------------------------------------------------------------------- */

const issuers = [
  { name: "Bureau Veritas Certification", short: "Bureau Veritas" },
  { name: "SGS United Kingdom Ltd", short: "SGS" },
  { name: "TÜV SÜD Management Service", short: "TÜV SÜD" },
  { name: "BSI Assurance UK Ltd", short: "BSI" },
  { name: "LRQA Ltd", short: "LRQA" },
  { name: "DNV Business Assurance", short: "DNV" },
];

const scopes: Record<string, string> = {
  Alloys: "alloy components",
  Plastics: "injection-moulded parts",
  Chemicals: "industrial solvents",
  Metals: "metal bar and sheet",
  Ceramics: "technical ceramics",
  Packaging: "corrugated packaging",
  Salts: "industrial salts",
  Glassworks: "laboratory glassware",
  Resins: "epoxy resins",
  Minerals: "mineral fillers",
  Fibres: "technical fibres",
  Oils: "lubricating oils",
  Pigments: "inorganic pigments",
  Solvents: "process solvents",
  Carbon: "carbon black",
  Silica: "precipitated silica",
  Paper: "kraft paper",
  Textiles: "technical textiles",
  Coatings: "powder coatings",
  Foods: "food-grade additives",
};

const contacts = [
  "Priya Raman",
  "Tom Ashby",
  "Anja Keller",
  "Mikko Laine",
  "Elena Rossi",
  "Sam Okafor",
  "Grace Liu",
  "Omar Haddad",
  "Lena Vogel",
  "Ravi Menon",
  "Ines Duarte",
  "Jonas Berg",
  "Mei Tanaka",
  "Carlos Ortega",
  "Hana Novak",
  "Felix Brandt",
  "Nora Quinn",
  "Theo Marsh",
  "Aisha Bello",
  "Ben Carter",
];

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The four Figma draws (1223:113791); the rest follow the same pattern. */
const drawn: Record<
  string,
  { issuer: number; no: string; approved: string; until: string; kb: number }
> = {
  "Northwind Alloys": {
    issuer: 0,
    no: "GB25/81733",
    approved: "14 Mar 2024",
    until: "14 Mar 2027",
    kb: 212,
  },
  "Kestrel Plastics": {
    issuer: 1,
    no: "GB19/2210-Q",
    approved: "2 Dec 2023",
    until: "2 Dec 2026",
    kb: 188,
  },
  "Halden Chemicals": {
    issuer: 2,
    no: "12 100 58821",
    approved: "30 Jun 2024",
    until: "30 Jun 2027",
    kb: 240,
  },
  "Orion Packaging": {
    issuer: 3,
    no: "FS 702114",
    approved: "9 Aug 2024",
    until: "9 Aug 2027",
    kb: 176,
  },
};

export type Certificate = {
  kind: "certificate";
  supplier: string;
  item: number;
  fileName: string;
  sizeKb: number;
  issuer: string;
  issuerShort: string;
  certNo: string;
  approved: string;
  validUntil: string;
  /** Expires before 2027: the email asks for a renewal. */
  expiring: boolean;
  scope: string;
  url: string;
};

export type Email = {
  kind: "email";
  supplier: string;
  item: number;
  contact: string;
  to: string;
  subject: string;
  body: string[];
  sentAt: string;
  messageId: string;
  attachment: string;
  sizeKb: number;
};

export type OutputFile = Certificate | Email;

const slugOf = (supplier: string) => supplier.toLowerCase().replace(/\s+/g, "-");

const certificateOf = (supplier: string, item: number): Certificate => {
  const slug = slugOf(supplier);
  const known = drawn[supplier];
  const day = ((item * 7) % 27) + 1;
  const month = months[(item * 5) % 12]!;
  const year = 2026 + (item % 3 === 1 ? 0 : 1);
  const issuer = issuers[known?.issuer ?? item % issuers.length]!;
  const until = known?.until ?? `${day} ${month} ${year}`;
  return {
    kind: "certificate",
    supplier,
    item,
    fileName: `${slug}_iso-9001_cert.pdf`,
    sizeKb: known?.kb ?? 160 + ((item * 37) % 90),
    issuer: issuer.name,
    issuerShort: issuer.short,
    certNo:
      known?.no ??
      `${issuer.short.slice(0, 2).toUpperCase()}${20 + (item % 6)}/${10000 + item * 4271}`,
    approved: known?.approved ?? `${day} ${month} ${year - 3}`,
    validUntil: until,
    expiring: until.endsWith("2026"),
    scope: scopes[supplier.split(" ")[1] ?? ""] ?? "industrial supplies",
    url: `${slug}.com/quality/iso9001.pdf`,
  };
};

export type SupplierEntity = {
  name: string;
  item: number;
  contact: string;
  email: string;
  certificate?: Certificate;
  /** Mark supplier reviewed set its Last reviewed. */
  reviewed: boolean;
};

export type Failure = { supplier: string; item: number; reason: string };

export type RunOutputs = {
  run: RunRecord;
  entities: SupplierEntity[];
  certificates: Certificate[];
  emails: Email[];
  failures: Failure[];
  /** Mark supplier reviewed's updated entities. */
  updated: SupplierEntity[];
  /** Find active suppliers stopped the run. */
  findFailed: boolean;
};

const failureReason = (reason: string) =>
  reason === "404"
    ? "Certificate link returned 404"
    : reason === "timed out"
      ? "Certificate link timed out after 30 s"
      : reason;

/** Everything a run produced so far, by step. */
export const runOutputs = (run: RunRecord, now: number): RunOutputs => {
  const facts = factsOf(run, now);
  const n = facts.find === "done" ? facts.n : 0;
  const failedItems = new Map(
    facts.failures.map((failure) => [failure.item, failure.reason]),
  );
  const sendSpan = stageSpan("sendReviewEmail", facts.n);
  const entities = suppliers.slice(0, n).map((name, item) => {
    const contact = contacts[item % contacts.length]!;
    const fetched = item < facts.processed[1] && !failedItems.has(item);
    return {
      name,
      item,
      contact,
      email: `${contact.split(" ")[0]!.toLowerCase()}@${slugOf(name)}.com`,
      certificate: fetched ? certificateOf(name, item) : undefined,
      reviewed: item < facts.processed[3] && !failedItems.has(item),
    };
  });
  const certificates = entities.flatMap((entity) =>
    entity.certificate ? [entity.certificate] : [],
  );
  const emails = entities
    .filter(
      (entity) =>
        entity.certificate && entity.item < facts.processed[2],
    )
    .map((entity): Email => {
      const certificate = entity.certificate!;
      const first = entity.contact.split(" ")[0]!;
      return {
        kind: "email",
        supplier: entity.name,
        item: entity.item,
        contact: entity.contact,
        to: entity.email,
        subject: `Your monthly quality review · ${entity.name}`,
        body: certificate.expiring
          ? [
              `Hi ${first},`,
              `Your ISO 9001 certificate is on file, but it expires on ${certificate.validUntil}. Please send us the renewed certificate before then.`,
              "Thanks,\nAcme Quality",
            ]
          : [
              `Hi ${first},`,
              `Your ISO 9001 certificate is on file and valid until ${certificate.validUntil}. No action needed this month.`,
              "Thanks,\nAcme Quality",
            ],
        sentAt: clockPlus(
          run.startClock,
          (sendSpan?.from ?? 0) + 4 * (entity.item + 1),
        ),
        messageId: `<r${run.id}-${String(entity.item + 1).padStart(2, "0")}@mail.acme.example>`,
        attachment: certificate.fileName,
        sizeKb: certificate.sizeKb + 14,
      };
    });
  return {
    run,
    entities,
    certificates,
    emails,
    failures: [...failedItems.entries()]
      .filter(([item]) => item < facts.processed[1] && item < n)
      .map(([item, reason]) => ({
        supplier: suppliers[item]!,
        item,
        reason: failureReason(reason),
      })),
    updated: entities.filter((entity) => entity.reviewed),
    findFailed: facts.find === "failed",
  };
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/* ----------------------------------------------------------------------------------------------------------------
 * Drawn pages: a certificate's first page and an email, at 420 × 560, scaled into any box
 * ------------------------------------------------------------------------------------------------------------- */

const pageWidth = 420;
const pageHeight = 560;

const paperStyle = css({
  width: "[420px]",
  height: "[560px]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  color: "neutral.fg.heading",
  fontFamily: "body",
});

const issuerStyle = css({
  fontSize: "[15px]", // token-guard: allow a drawn print page, scaled as a whole
});

const standardStyle = css({
  marginTop: "[10px]",
  fontSize: "[14px]", // token-guard: allow a drawn print page, scaled as a whole
});

const subjectStyle = css({
  fontSize: "[18px]", // token-guard: allow a drawn print page, scaled as a whole
  fontWeight: "medium",
});

const CertificatePage = ({ file }: { file: Certificate }) => (
  <div
    className={cx(
      paperStyle,
      css({ alignItems: "center", paddingX: "[40px]", paddingTop: "[44px]" }),
    )}
  >
    <div className={css({ display: "flex", alignItems: "center", gap: "[10px]" })}>
      <span
        className={css({
          width: "[26px]",
          height: "[26px]",
          borderRadius: "full",
          backgroundColor: "neutral.fg.body",
        })}
      />
      <span className={issuerStyle}>{file.issuer}</span>
    </div>
    <div
      className={css({
        marginTop: "[22px]",
        fontSize: "[30px]", // token-guard: allow a drawn print page, scaled as a whole
        letterSpacing: "[0.02em]",
        fontWeight: "medium",
      })}
    >
      CERTIFICATE
    </div>
    <div className={standardStyle}>
      ISO 9001:2015 · Quality management system
    </div>
    <div
      className={css({
        marginTop: "[24px]",
        fontSize: "[13px]", // token-guard: allow a drawn print page, scaled as a whole
        color: "neutral.fg.subtle",
      })}
    >
      This is to certify that the management system of
    </div>
    <div
      className={css({
        marginTop: "[14px]",
        fontSize: "[20px]", // token-guard: allow a drawn print page, scaled as a whole
        fontWeight: "medium",
      })}
    >
      {file.supplier} Ltd
    </div>
    <div
      className={css({
        marginTop: "[14px]",
        fontSize: "[13px]", // token-guard: allow a drawn print page, scaled as a whole
        lineHeight: "[22px]",
        textAlign: "center",
        color: "neutral.fg.subtle",
      })}
    >
      has been assessed and found to conform to ISO 9001:2015 for the design,
      manufacture and supply of {file.scope}.
    </div>
    <div
      className={css({
        marginTop: "[26px]",
        width: "[100%]",
        display: "grid",
        gridTemplateColumns: "[1fr auto]",
        rowGap: "[10px]",
        fontSize: "[13px]", // token-guard: allow a drawn print page, scaled as a whole
        "& > span:nth-child(odd)": { color: "neutral.fg.subtle" },
      })}
    >
      <span>Certificate no.</span>
      <span>{file.certNo}</span>
      <span>Original approval</span>
      <span>{file.approved}</span>
      <span>Valid until</span>
      <span>{file.validUntil}</span>
    </div>
    <div
      className={css({
        marginTop: "[30px]",
        width: "[150px]",
        borderTopWidth: "[1px]",
        borderTopStyle: "solid",
        borderTopColor: "neutral.bd.subtle",
        paddingTop: "[8px]",
        textAlign: "center",
        fontSize: "[11px]", // token-guard: allow a drawn print page, scaled as a whole
        color: "neutral.fg.subtle",
      })}
    >
      Authorised signatory
    </div>
  </div>
);

const EmailPage = ({ file }: { file: Email }) => (
  <div className={cx(paperStyle, css({ padding: "[32px]", gap: "[18px]" }))}>
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "[52px 1fr]",
        rowGap: "[6px]",
        fontSize: "[13px]", // token-guard: allow a drawn print page, scaled as a whole
        "& > span:nth-child(odd)": { color: "neutral.fg.subtle" },
      })}
    >
      <span>From</span>
      <span>Acme Quality · quality@acme.example</span>
      <span>To</span>
      <span>
        {file.contact} · {file.to}
      </span>
    </div>
    <div className={subjectStyle}>
      {file.subject}
    </div>
    <div
      className={css({
        height: "[1px]",
        backgroundColor: "neutral.bd.subtle",
      })}
    />
    {file.body.map((paragraph) => (
      <p
        key={paragraph}
        className={css({
          fontSize: "[14px]", // token-guard: allow a drawn print page, scaled as a whole
          lineHeight: "[22px]",
          whiteSpace: "pre-line",
          color: "neutral.fg.body",
        })}
      >
        {paragraph}
      </p>
    ))}
    <div
      className={css({
        marginTop: "auto",
        display: "flex",
        alignItems: "center",
        gap: "[10px]",
        padding: "[10px]",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
        borderRadius: "[8px]",
        fontSize: "[13px]", // token-guard: allow a drawn print page, scaled as a whole
      })}
    >
      <Icon name="file" size="sm" />
      {file.attachment}
    </div>
  </div>
);

/** A drawn page, scaled to `width`; the 3 : 4 page keeps its shape. */
const Page = ({
  file,
  width,
  framed = true,
}: {
  file: OutputFile;
  width: number;
  framed?: boolean;
}) => {
  const scale = width / pageWidth;
  return (
    <span
      aria-hidden
      data-page-preview={file.kind}
      className={cx(
        css({
          position: "relative",
          display: "block",
          flexShrink: 0,
          overflow: "hidden",
          backgroundColor: "neutral.bgSolid.min",
        }),
        framed &&
          css({
            borderRadius: "[4px]",
            boxShadow: "[0 0 0 1px var(--colors-neutral-a20)]",
          }),
      )}
      style={{ width, height: Math.round(pageHeight * scale) }}
    >
      <span
        className={css({
          position: "absolute",
          top: "[0]",
          left: "[0]",
          transformOrigin: "top left",
        })}
        style={{ transform: `scale(${scale})` }}
      >
        {file.kind === "certificate" ? (
          <CertificatePage file={file} />
        ) : (
          <EmailPage file={file} />
        )}
      </span>
    </span>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * File text: the name and two meta lines
 * ------------------------------------------------------------------------------------------------------------- */

const fileTitle = (file: OutputFile) =>
  file.kind === "certificate" ? file.fileName : `${file.contact} · ${file.supplier}`;

const fileMeta = (file: OutputFile) =>
  file.kind === "certificate"
    ? `PDF · 1 page · ${file.sizeKb} KB`
    : `Email · sent ${file.sentAt} · 1 attachment`;

const fileDetail = (file: OutputFile) =>
  file.kind === "certificate"
    ? `ISO 9001 · ${file.issuerShort} · valid to ${file.validUntil}`
    : file.subject;

/* ----------------------------------------------------------------------------------------------------------------
 * The viewer: a file modal, or a table of entities
 * ------------------------------------------------------------------------------------------------------------- */

type Column = { label: string; cell: (row: SupplierEntity) => React.ReactNode };

export type ViewerState =
  | { kind: "files"; files: OutputFile[]; index: number; from: string }
  | {
      kind: "entities";
      title: string;
      from: string;
      rows: SupplierEntity[];
      columns: Column[];
    };

const factsGridStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  "& dt": { textStyle: "xs", color: "neutral.fg.subtle" },
  "& dd": {
    marginTop: "0.5",
    textStyle: "sm",
    color: "neutral.fg.heading",
    overflowWrap: "anywhere",
  },
});

const pillStyle = css({
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  height: "[20px]",
  paddingX: "[6px]",
  borderRadius: "md",
  textStyle: "xs",
  fontWeight: "medium",
});

const FileFacts = ({ file, run }: { file: OutputFile; run: RunRecord }) => {
  const rows: [string, string][] =
    file.kind === "certificate"
      ? [
          ["Supplier", file.supplier],
          ["Standard", "ISO 9001:2015"],
          ["Issued by", file.issuer],
          ["Certificate no.", file.certNo],
          ["Valid until", file.validUntil],
          ["Fetched from", file.url.replaceAll("/", "/\u200B")],
          ["Saved as", "File entity in @acme"],
        ]
      : [
          ["To", `${file.contact} · ${file.to}`],
          ["Supplier", file.supplier],
          ["Sent", `${run.when.split(",")[0]}, ${file.sentAt}`],
          ["Attachment", file.attachment],
          ["Message ID", file.messageId],
        ];
  const good = file.kind === "email" || !file.expiring;
  return (
    <dl className={factsGridStyle}>
      <span
        className={pillStyle}
        style={{
          backgroundColor: good
            ? "var(--flows-done-badgeBg)"
            : "var(--flows-needsReview-badgeBg)",
          color: good
            ? "var(--flows-done-badgeFg)"
            : "var(--flows-needsReview-badgeFg)",
        }}
      >
        {file.kind === "email" ? "Sent" : good ? "Valid" : "Expires soon"}
      </span>
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const counterStyle = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
  minWidth: "[52px]",
  textAlign: "center",
});

const FileModal = ({
  view,
  run,
  onChange,
  onClose,
}: {
  view: Extract<ViewerState, { kind: "files" }>;
  run: RunRecord;
  onChange: (next: ViewerState) => void;
  onClose: () => void;
}) => {
  const file = view.files[view.index]!;
  const go = (by: number) => {
    const index = view.index + by;
    if (index >= 0 && index < view.files.length) {
      onChange({ ...view, index });
    }
  };
  return (
    <Dialog
      size="lg"
      variant="plain"
      onClose={onClose}
      aria-label={fileTitle(file)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          go(event.key === "ArrowLeft" ? -1 : 1);
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          // Keeps the run view's ↑ ↓ (switch runs) out of the modal.
          event.stopPropagation();
        }
      }}
    >
      <Dialog.Header
        title={file.kind === "certificate" ? file.fileName : file.subject}
        description={`${fileMeta(file)} · ${file.supplier} · Run ${run.id}`}
        actions={
          <span className={headerActionsStyle} data-output-modal-actions>
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="arrowLeft"
              aria-label="Previous file"
              tooltip="Previous · ←"
              disabled={view.index === 0}
              onClick={() => go(-1)}
            />
            <span className={counterStyle}>
              {view.index + 1} of {view.files.length}
            </span>
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="arrowRight"
              aria-label="Next file"
              tooltip="Next · →"
              disabled={view.index === view.files.length - 1}
              onClick={() => go(1)}
            />
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              tooltip="MOCK: the prototype has no real files"
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="arrowUpRight"
              iconPosition="right"
              tooltip={
                file.kind === "certificate"
                  ? "Opens the File entity in HASH (not in the prototype)"
                  : "Opens the sent email (not in the prototype)"
              }
            >
              {file.kind === "certificate" ? "Open in Files" : "Open in Mail"}
            </Button>
          </span>
        }
      />
      <Dialog.Body>
        <div
          data-output-modal={file.kind}
          className={css({
            display: "grid",
            gridTemplateColumns: "[1fr 264px]",
            minHeight: "[0]",
            // Edge to edge inside the Dialog body's own padding (16 px top, 20 px bottom).
            marginTop: "[-16px]",
            marginX: "[calc(var(--panel-horizontal-padding) * -1)]",
            marginBottom: "[-20px]",
          })}
        >
          <div
            className={css({
              display: "flex",
              justifyContent: "center",
              padding: "8",
              backgroundColor: "neutral.bgSolid.surface",
              borderBottomLeftRadius: "xl",
            })}
          >
            <Page file={file} width={420} />
          </div>
          <div className={css({ padding: "6" })}>
            <FileFacts file={file} run={run} />
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
};

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    textAlign: "left",
    textStyle: "xs",
    fontWeight: "medium",
    color: "neutral.fg.subtle",
    height: "[36px]",
    paddingX: "3",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
  },
  "& td": {
    height: "[44px]",
    paddingX: "3",
    color: "neutral.fg.body",
    whiteSpace: "nowrap",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
  },
  "& td:first-child": { color: "neutral.fg.heading", fontWeight: "medium" },
  "& tbody tr:last-child td": { borderBottomWidth: "[0]" },
});

const linkStyle = css({
  display: "inline",
  padding: "[0]",
  border: "none",
  background: "[transparent]",
  font: "[inherit]",
  color: "[inherit]",
  cursor: "pointer",
  textDecorationLine: "underline",
  textDecorationColor: "neutral.a20",
  textUnderlineOffset: "[3px]",
  _hover: { textDecorationColor: "neutral.fg.muted" },
});

const EntityModal = ({
  view,
  run,
  onChange,
  onClose,
  outputs,
}: {
  view: Extract<ViewerState, { kind: "entities" }>;
  run: RunRecord;
  onChange: (next: ViewerState) => void;
  onClose: () => void;
  outputs: RunOutputs;
}) => (
  <Dialog size="lg" variant="plain" onClose={onClose} aria-label={view.title}>
    <Dialog.Header
      title={view.title}
      description={`${view.from} · Run ${run.id} · ${run.when}`}
      actions={
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          iconName="arrowUpRight"
          iconPosition="right"
          tooltip="Opens these entities in HASH (not in the prototype)"
        >
          Open in Entities
        </Button>
      }
    />
    <Dialog.Body>
      <div
        data-entity-table
        className={css({
          maxHeight: "[60vh]",
          overflowY: "auto",
          marginX: "[-12px]",
        })}
      >
        <table className={tableStyle}>
          <thead>
            <tr>
              {view.columns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.name}>
                {view.columns.map((column) => (
                  <td key={column.label}>
                    {column.label === "Certificate" && row.certificate ? (
                      <button
                        type="button"
                        className={linkStyle}
                        onClick={() =>
                          onChange({
                            kind: "files",
                            files: outputs.certificates,
                            index: outputs.certificates.indexOf(
                              row.certificate!,
                            ),
                            from: "Fetch certificate",
                          })
                        }
                      >
                        {column.cell(row)}
                      </button>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog.Body>
  </Dialog>
);

const muted = (text: string) => (
  <span className={css({ color: "neutral.fg.subtle" })}>{text}</span>
);

/** The entity tables each output opens. */
export const entityViews = (outputs: RunOutputs) => {
  const certificateCell = (row: SupplierEntity) =>
    row.certificate ? row.certificate.fileName : muted("None");
  return {
    suppliers: {
      kind: "entities" as const,
      title: plural(outputs.entities.length, "supplier"),
      from: "Find active suppliers",
      rows: outputs.entities,
      columns: [
        { label: "Name", cell: (row: SupplierEntity) => row.name },
        { label: "Contact", cell: (row: SupplierEntity) => row.contact },
        { label: "Email", cell: (row: SupplierEntity) => row.email },
        { label: "Certificate", cell: certificateCell },
      ],
    },
    reviewed: {
      kind: "entities" as const,
      title: `${plural(outputs.updated.length, "supplier")} updated`,
      from: "Mark supplier reviewed",
      rows: outputs.updated,
      columns: [
        { label: "Name", cell: (row: SupplierEntity) => row.name },
        { label: "Last reviewed", cell: () => "November 2026" },
        {
          label: "Certificate expiry",
          cell: (row: SupplierEntity) => row.certificate?.validUntil ?? "",
        },
        { label: "Certificate", cell: certificateCell },
      ],
    },
    values: (property: "Name" | "Contact email" | "Certificate link") => ({
      kind: "entities" as const,
      title: `${plural(outputs.entities.length, "value")} · ${property}`,
      from: `Read ${property.toLowerCase()}`,
      rows: outputs.entities,
      columns: [
        { label: "Supplier", cell: (row: SupplierEntity) => row.name },
        {
          label: property,
          cell: (row: SupplierEntity) =>
            property === "Name"
              ? row.name
              : property === "Contact email"
                ? row.email
                : `https://${slugOf(row.name)}.com/quality/iso9001.pdf`,
        },
      ],
    }),
  };
};

/** The viewer's state and its modal; `node` goes anywhere in the tree (the Dialog portals out). */
export const useOutputViewer = (outputs: RunOutputs | null) => {
  const [view, setView] = useState<ViewerState | null>(null);
  const node =
    view && outputs ? (
      view.kind === "files" ? (
        <FileModal
          view={view}
          run={outputs.run}
          onChange={setView}
          onClose={() => setView(null)}
        />
      ) : (
        <EntityModal
          view={view}
          run={outputs.run}
          outputs={outputs}
          onChange={setView}
          onClose={() => setView(null)}
        />
      )
    ) : null;
  return { open: setView, node };
};

/* ----------------------------------------------------------------------------------------------------------------
 * Panel parts
 * ------------------------------------------------------------------------------------------------------------- */

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const blockHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "[24px]",
});

/** Under the panel's Outputs heading, so one step quieter: muted, regular. */
const blockTitleStyle = css({
  textStyle: "sm",
  color: "neutral.fg.muted",
});

const quietStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

const linkOutStyle = css({
  "&[class]": { color: "neutral.fg.muted" },
});

const Block = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className={blockStyle}>
    <div className={blockHeadStyle}>
      <span className={blockTitleStyle}>{title}</span>
      {action}
    </div>
    {children}
  </section>
);

const LinkOut = ({ label, tooltip }: { label: string; tooltip: string }) => (
  <Button
    size="xs"
    variant="ghost"
    tone="neutral"
    iconName="arrowUpRight"
    iconPosition="right"
    className={linkOutStyle}
    tooltip={tooltip}
  >
    {label}
  </Button>
);

const rowButtonStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto 1fr]",
  alignItems: "center",
  columnGap: "3",
  width: "[100%]",
  marginX: "[-8px]",
  paddingX: "2",
  paddingY: "2",
  border: "none",
  borderRadius: "lg",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  _focusVisible: {
    outline: "none",
    boxShadow: "[0 0 0 2px var(--colors-neutral-a20)]",
  },
  "& > span:last-child": { minWidth: "[0]" },
});

const titleLineStyle = css({
  display: "block",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const metaLineStyle = css({
  display: "block",
  marginTop: "0.5",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const FileRow = ({
  file,
  onOpen,
}: {
  file: OutputFile;
  onOpen: () => void;
}) => (
  <button
    type="button"
    className={cx(rowButtonStyle, css({ width: "[calc(100% + 16px)]" }))}
    data-output-file={file.kind}
    onClick={onOpen}
  >
    <Page file={file} width={44} />
    <span>
      <span className={titleLineStyle}>{fileTitle(file)}</span>
      <span className={metaLineStyle}>{fileMeta(file)}</span>
      <span className={metaLineStyle}>{fileDetail(file)}</span>
    </span>
  </button>
);

const gridCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "[0]",
  border: "none",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  minWidth: "[0]",
  "&:hover [data-page-preview]": {
    boxShadow: "[0 0 0 1px var(--colors-neutral-a40)]",
  },
});

const GridCard = ({
  file,
  width,
  onOpen,
}: {
  file: OutputFile;
  width: number;
  onOpen: () => void;
}) => (
  <button
    type="button"
    className={gridCardStyle}
    data-output-file={file.kind}
    onClick={onOpen}
  >
    <Page file={file} width={width} />
    <span>
      <span className={titleLineStyle}>
        {file.kind === "certificate" ? file.supplier : file.contact}
      </span>
      <span className={metaLineStyle}>
        {file.kind === "certificate"
          ? `PDF · ${file.sizeKb} KB`
          : file.supplier}
      </span>
      <span className={metaLineStyle}>
        {file.kind === "certificate"
          ? `valid to ${file.validUntil}`
          : `sent ${file.sentAt}`}
      </span>
    </span>
  </button>
);

const heroStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[100%]",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "xl",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  _hover: { borderColor: "neutral.bd.solid" },
  "& [data-page-preview]": { alignSelf: "center" },
});

const MoreButton = ({
  hidden,
  open,
  onToggle,
}: {
  hidden: number;
  open: boolean;
  onToggle: () => void;
}) =>
  hidden > 0 || open ? (
    <Button
      size="xs"
      variant="ghost"
      tone="neutral"
      className={css({ alignSelf: "flex-start", marginLeft: "[-6px]" })}
      onClick={onToggle}
    >
      {open ? "Show fewer" : `+ ${hidden} more`}
    </Button>
  ) : null;

const failureRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[16px 1fr]",
  columnGap: "3",
  alignItems: "start",
  paddingY: "1",
});

const Failures = ({ failures }: { failures: Failure[] }) =>
  failures.length > 0 ? (
    <Block title={`Failed · ${failures.length}`}>
      <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
        {failures.map((failure) => (
          <div key={failure.supplier} className={failureRowStyle}>
            <span className={css({ display: "flex", paddingTop: "[2px]" })}>
              <RunGlyph state="failed" size={16} detail={failure.reason} />
            </span>
            <span>
              <span className={titleLineStyle}>{failure.supplier}</span>
              <span className={metaLineStyle}>{failure.reason}</span>
            </span>
          </div>
        ))}
      </div>
    </Block>
  ) : null;

/** A file list in the picked take. */
const FileList = ({
  take,
  files,
  title,
  linkOut,
  footer,
  onOpen,
}: {
  take: StepOutputsTake;
  files: OutputFile[];
  title: string;
  linkOut: React.ReactNode;
  footer?: string;
  onOpen: (index: number) => void;
}) => {
  const [all, setAll] = useState(false);
  if (files.length === 0) {
    return (
      <Block title={title}>
        <span className={quietStyle}>None yet</span>
      </Block>
    );
  }
  if (take === "b") {
    const shown = all ? files : files.slice(0, 4);
    return (
      <Block title={title} action={linkOut}>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "[1fr 1fr]",
            columnGap: "4",
            rowGap: "5",
          })}
        >
          {shown.map((file, index) => (
            <GridCard
              key={file.supplier}
              file={file}
              width={156}
              onOpen={() => onOpen(index)}
            />
          ))}
        </div>
        <MoreButton
          hidden={files.length - shown.length}
          open={all}
          onToggle={() => setAll(!all)}
        />
        {footer ? <span className={quietStyle}>{footer}</span> : null}
      </Block>
    );
  }
  if (take === "c") {
    const [first, ...rest] = files;
    const shown = all ? rest : rest.slice(0, 2);
    return (
      <Block title={title} action={linkOut}>
        <button
          type="button"
          className={heroStyle}
          data-output-file={first!.kind}
          onClick={() => onOpen(0)}
        >
          <Page file={first!} width={210} />
          <span>
            <span className={titleLineStyle}>{fileTitle(first!)}</span>
            <span className={metaLineStyle}>{fileMeta(first!)}</span>
            <span className={metaLineStyle}>{fileDetail(first!)}</span>
          </span>
        </button>
        <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
          {shown.map((file, index) => (
            <FileRow
              key={file.supplier}
              file={file}
              onOpen={() => onOpen(index + 1)}
            />
          ))}
        </div>
        <MoreButton
          hidden={rest.length - shown.length}
          open={all}
          onToggle={() => setAll(!all)}
        />
        {footer ? <span className={quietStyle}>{footer}</span> : null}
      </Block>
    );
  }
  const shown = all ? files : files.slice(0, take === "d" ? 2 : 4);
  return (
    <Block title={title} action={linkOut}>
      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        {shown.map((file, index) => (
          <FileRow key={file.supplier} file={file} onOpen={() => onOpen(index)} />
        ))}
      </div>
      <MoreButton
        hidden={files.length - shown.length}
        open={all}
        onToggle={() => setAll(!all)}
      />
      {footer ? <span className={quietStyle}>{footer}</span> : null}
    </Block>
  );
};

const entityRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  minHeight: "[44px]",
  paddingX: "3",
  paddingY: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  color: "neutral.fg.muted",
  _hover: {
    borderColor: "neutral.bd.solid",
    backgroundColor: "neutral.bg.surface.hover",
  },
});

/** A list of entities or values, inline as a count and the first names; opens the table. */
const EntityOutput = ({
  label,
  icon,
  count,
  names,
  onOpen,
}: {
  label: string;
  icon: IconName;
  count: string;
  names: string[];
  onOpen: () => void;
}) => (
  <Block title={label}>
    <button
      type="button"
      className={entityRowStyle}
      data-output-entities={label}
      onClick={onOpen}
    >
      <Icon name={icon} size="sm" />
      <span className={css({ flex: "1", minWidth: "[0]" })}>
        <span className={titleLineStyle}>{count}</span>
        {names.length > 0 ? (
          <span className={metaLineStyle}>
            {names.slice(0, 2).join(", ")}
            {names.length > 2 ? `, +${names.length - 2}` : ""}
          </span>
        ) : null}
      </span>
      <Icon name="chevronRight" size="sm" />
    </button>
  </Block>
);

const miniTableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  textStyle: "xs",
  "& th": {
    textAlign: "left",
    fontWeight: "normal",
    color: "neutral.fg.subtle",
    paddingX: "3",
    paddingTop: "2.5",
    paddingBottom: "1.5",
  },
  "& td": {
    paddingX: "3",
    paddingY: "1.5",
    color: "neutral.fg.body",
    whiteSpace: "nowrap",
  },
  "& tbody tr:last-child td": { paddingBottom: "2.5" },
});

const boxStyle = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
});

/* ----------------------------------------------------------------------------------------------------------------
 * A step's outputs, in the take
 * ------------------------------------------------------------------------------------------------------------- */

const panelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "6",
});

/** The Outputs part of a step's run panel. Returns null for steps with plain outputs (the sign-off's Decision). */
export const StepOutputs = ({
  stepId,
  outputs,
}: {
  stepId: string;
  outputs: RunOutputs;
}) => {
  const take = useStepOutputsTake();
  const { open, node } = useOutputViewer(outputs);
  const views = entityViews(outputs);
  const openFiles = (files: OutputFile[], from: string) => (index: number) =>
    open({ kind: "files", files, index, from });
  const names = (rows: SupplierEntity[]) => rows.map((row) => row.name);
  let body: React.ReactNode = null;
  switch (stepId) {
    case "findSuppliers":
      body = (
        <EntityOutput
          label="Entities"
          icon="cubes"
          count={plural(outputs.entities.length, "supplier")}
          names={names(outputs.entities)}
          onOpen={() => open(views.suppliers)}
        />
      );
      break;
    case forEachId:
      body = (
        <EntityOutput
          label="Reviewed suppliers"
          icon="cubes"
          count={plural(outputs.updated.length, "supplier")}
          names={names(outputs.updated)}
          onOpen={() => open(views.reviewed)}
        />
      );
      break;
    case "readName":
    case "readEmail":
    case "readCertificateLink": {
      const property =
        stepId === "readName"
          ? "Name"
          : stepId === "readEmail"
            ? "Contact email"
            : "Certificate link";
      const view = views.values(property);
      body = (
        <EntityOutput
          label="Values"
          icon="text"
          count={plural(outputs.entities.length, "value")}
          names={outputs.entities.map((row) => {
            const cell = view.columns[1]!.cell(row);
            return typeof cell === "string" ? cell : row.name;
          })}
          onOpen={() => open(view)}
        />
      );
      break;
    }
    case "markReviewed":
      body = (
        <EntityOutput
          label="Entities"
          icon="cubes"
          count={`${plural(outputs.updated.length, "supplier")} updated`}
          names={names(outputs.updated)}
          onOpen={() => open(views.reviewed)}
        />
      );
      break;
    case "fetchCertificate": {
      const files = outputs.certificates;
      const list = (
        <FileList
          take={take}
          files={files}
          title={
            take === "d"
              ? `Files · ${plural(files.length, "PDF")}`
              : `Certificates · ${plural(files.length, "PDF")}`
          }
          linkOut={
            <LinkOut
              label={take === "d" ? "Open all" : "Open all in Files"}
              tooltip="Opens these File entities in HASH (not in the prototype)"
            />
          }
          footer={
            take === "a"
              ? `Saved as ${plural(files.length, "File entity", "File entities")} in @acme · used by Send review email`
              : undefined
          }
          onOpen={openFiles(files, "Fetch certificate")}
        />
      );
      const failures = <Failures failures={outputs.failures} />;
      body =
        take === "c" ? (
          <>
            {list}
            {failures}
          </>
        ) : take === "d" ? (
          <>
            {failures}
            {list}
            <EntityOutput
              label={`Entities · ${files.length} Supplier updated`}
              icon="cubes"
              count="Certificate, Certificate expiry"
              names={names(outputs.entities.filter((row) => row.certificate))}
              onOpen={() => open(views.reviewed)}
            />
            <Block
              title={`Table · certificates.csv · ${plural(files.length, "row")}`}
              action={
                <Button
                  size="xs"
                  variant="ghost"
                  tone="neutral"
                  className={linkOutStyle}
                  onClick={() => open(views.reviewed)}
                >
                  Open
                </Button>
              }
            >
              <div className={boxStyle}>
                <table className={miniTableStyle}>
                  <thead>
                    <tr>
                      <th>supplier</th>
                      <th>status</th>
                      <th>expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.slice(0, 3).map((file) => (
                      <tr key={file.supplier}>
                        <td>{file.supplier}</td>
                        <td>{file.kind === "certificate" && file.expiring ? "expiring" : "valid"}</td>
                        <td>{file.kind === "certificate" ? file.validUntil : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          </>
        ) : (
          <>
            {failures}
            {list}
          </>
        );
      break;
    }
    case "sendReviewEmail": {
      const files = outputs.emails;
      const skipped = outputs.failures.length;
      body = (
        <>
          <FileList
            take={take}
            files={files}
            title={`Emails · ${files.length} sent`}
            linkOut={
              <LinkOut
                label="Open in Mail"
                tooltip="Opens the sent emails (not in the prototype)"
              />
            }
            footer={
              skipped > 0
                ? `${plural(skipped, "supplier")} skipped: no certificate to send`
                : undefined
            }
            onOpen={openFiles(files, "Send review email")}
          />
          {take === "d" && files[0] ? (
            <Block title="Text · email body">
              <button
                type="button"
                className={cx(
                  boxStyle,
                  css({
                    padding: "3",
                    textAlign: "left",
                    background: "[transparent]",
                    cursor: "pointer",
                    textStyle: "xs",
                    lineHeight: "[18px]",
                    color: "neutral.fg.muted",
                    _hover: { borderColor: "neutral.bd.solid" },
                  }),
                )}
                onClick={() => openFiles(files, "Send review email")(0)}
              >
                {files[0].body.slice(0, 2).join(" ")}
              </button>
            </Block>
          ) : null}
        </>
      );
      break;
    }
    default:
      return null;
  }
  return (
    <div className={panelStackStyle} data-step-outputs={take}>
      {body}
      {node}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The History table's Outputs cell: "20 suppliers · 18 certificates · 18 emails", each part opening the viewer
 * ------------------------------------------------------------------------------------------------------------- */

const cellStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  color: "neutral.fg.body",
});

const dotStyle = css({ color: "neutral.fg.subtle" });

/** Certificates and emails stay separate counts until Dei says otherwise. */
export const RunOutputsCell = ({
  run,
  now,
}: {
  run: RunRecord;
  now: number;
}) => {
  const outputs = runOutputs(run, now);
  const { open, node } = useOutputViewer(outputs);
  if (outputs.findFailed) {
    return (
      <span className={css({ color: "neutral.fg.subtle" })}>
        Nothing · stopped at Find active suppliers
      </span>
    );
  }
  const views = entityViews(outputs);
  const parts = [
    {
      key: "suppliers",
      text: plural(outputs.entities.length, "supplier"),
      count: outputs.entities.length,
      onOpen: () => open(views.suppliers),
    },
    {
      key: "certificates",
      text: plural(outputs.certificates.length, "certificate"),
      count: outputs.certificates.length,
      onOpen: () =>
        open({
          kind: "files",
          files: outputs.certificates,
          index: 0,
          from: "Fetch certificate",
        }),
    },
    {
      key: "emails",
      text: plural(outputs.emails.length, "email"),
      count: outputs.emails.length,
      onOpen: () =>
        open({
          kind: "files",
          files: outputs.emails,
          index: 0,
          from: "Send review email",
        }),
    },
  ].filter((part) => part.count > 0);
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keeps a part's click off the row
    <span
      className={cellStyle}
      data-run-outputs={run.id}
      onClick={(event) => event.stopPropagation()}
    >
      {parts.length === 0 ? (
        <span className={css({ color: "neutral.fg.subtle" })}>Nothing yet</span>
      ) : (
        parts.map((part, index) => (
          <Fragment key={part.key}>
            {index > 0 ? <span className={dotStyle}>·</span> : null}
            <button
              type="button"
              className={linkStyle}
              data-run-output={part.key}
              onClick={part.onOpen}
            >
              {part.text}
            </button>
          </Fragment>
        ))
      )}
      {node}
    </span>
  );
};
