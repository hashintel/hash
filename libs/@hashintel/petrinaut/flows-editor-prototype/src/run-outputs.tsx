import { useReactFlow, type Viewport } from "@xyflow/react";
import { Mail, Paperclip } from "lucide-react";
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
 * Outputs can be entities of any type (Ciarán, 4 Nov). Run 14's Find active suppliers returned two types, Supplier
 * and Distributor; the two ways to show that sit behind ?entitytypes=a|b (inbox `picks/entity-types`), read from the
 * URL only; no param is A.
 * A. Group by type: one table per type, each with its own columns; History counts each type ("14 suppliers · 6
 *    distributors").
 * B. One table with a Type column; columns only some types have are blank for the rest; History says "20 entities".
 *
 * The History Outputs column lists only the outputs flagged "Show in run history" (`document.flaggedOutputs`).
 *
 * Where the viewer opens sits behind ?outputs=inline|expand|modal (inbox `picks/outputs-container`), read from the URL
 * only; no param is the modal. Inline swaps the right column (the run's step panel, or History's overview) for the
 * list with a back arrow; expand adds a wide, non-modal side sheet. The loop step's outputs (suppliers, certificates
 * and emails) are the mixed list the three are compared on.
 *
 * MOCK: no flow runs and no files exist; the certificates and emails are drawn from the seed suppliers.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  Button,
  Dialog,
  Drawer,
  Icon,
  type IconName,
  Menu,
  Tooltip,
  usePortalContainerRef,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { flaggedOutputsOf, flattenSteps, outputKey } from "./document";
import { useEditor } from "./editor-context";
import { MixedFileOutputs, useFileTypes } from "./file-types";
import { firstLineIconStyle, selectedLabel } from "./menu-rows";
import { useLocation } from "./router";
import { RunGlyph } from "./run-glyph";
import { FileRow as DsFileRow } from "./ds-parts/file-row";
import { RunIdsIn, runLabel } from "./run-id";
import { TextLink } from "./text-link";
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

/**
 * An email row, by take (inbox `picks/email-rows`): Aakarsh picked 1 on 5 Nov, so 1 is the default; ?emailrow=2..4
 * shows the others.
 * 1. Recipient first: initials, recipient, subject, sent time; a status mark only when an email bounced.
 * 2. Delivery status first: an F3 mark (sent or bounced) leads, then recipient and subject.
 * 3. A plain mail glyph, recipient, subject and a one-line snippet.
 * 4. Take 1 plus a paperclip and the attached file's name.
 * Page thumbnails stay for real files (PDFs) only in every take.
 */
export type EmailRowTake = "1" | "2" | "3" | "4" | null;

export const useEmailRowTake = (): EmailRowTake => {
  const value = useLocation().query.get("emailrow");
  return value === "1" || value === "2" || value === "3" || value === "4"
    ? value
    : "1";
};

/**
 * ?edgecase=1..6 (inbox `picks/outputs-container`, Aakarsh 5 Nov: "why are you so sure the outputs will be too big
 * for the right pane"): one seed-flow output, mocked on the step it comes from, to see inline against the side sheet.
 * URL only; no param changes nothing. 1 Find → 20 suppliers × 8 properties; 2 Find → 14 Suppliers + 6 Distributors with
 * their own properties; 3 For each over 200 suppliers, 3 failed; 4 Fetch → 18 PDFs; 5 a failed Fetch, its error and
 * input URL; 6 Read contact email → Name and Email.
 */
export const useEdgeCase = (): number | null => {
  const value = Number(useLocation().query.get("edgecase"));
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
};

/**
 * How a list of more than one type moves between types (inbox `picks/entity-types`). Decided 5 Nov: b, type tabs
 * ("Suppliers 14 · Distributors 6") above the list, in every container (inline column, side sheet, modal); a single
 * type draws no tabs. The two not picked stay behind ?entityswitch=a|c, read from the URL only:
 * a. Stacked sections: a heading and count per type, scroll moves between them, each with "+ N more".
 * c. A type filter in the list header: "All types ▾", or one type (the inline column only).
 */
export type EntitySwitchTake = "a" | "b" | "c";

export const useEntitySwitch = (): EntitySwitchTake => {
  const value = useLocation().query.get("entityswitch")?.toLowerCase();
  return value === "a" || value === "c" ? value : "b";
};

export type EntityTypesTake = "a" | "b";

/** ?entitytypes=a|b; no param is A, the inbox row's recommendation. */
export const useEntityTypesTake = (): EntityTypesTake =>
  useLocation().query.get("entitytypes")?.toLowerCase() === "b" ? "b" : "a";

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
  /** MOCK: Run 16 has one bounced email, so every email-row take shows the case. */
  delivery: "sent" | "bounced";
  bounce?: string;
};

export type OutputFile = Certificate | Email;

const slugOf = (supplier: string) =>
  supplier.toLowerCase().replace(/\s+/g, "-");

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

/** MOCK: the run with one bounced review email, and which supplier's it was (Halden Chemicals, the third row). */
const bouncedRunId = 16;
const bouncedItem = 2;

/** MOCK: the run whose Find active suppliers returned two entity types. */
export const mixedTypesRunId = 14;

export type EntityTypeName = "Supplier" | "Distributor";

/** A type's name in a count: "14 suppliers". */
const typeNoun: Record<EntityTypeName, string> = {
  Supplier: "supplier",
  Distributor: "distributor",
};

const regions = [
  "UK and Ireland",
  "Benelux",
  "Nordics",
  "Iberia",
  "DACH",
  "France",
];

export type SupplierEntity = {
  name: string;
  type: EntityTypeName;
  /** A Distributor's own property, which a Supplier doesn't have. */
  region?: string;
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
  const entities = suppliers.slice(0, n).map((name, item): SupplierEntity => {
    const contact = contacts[item % contacts.length]!;
    const fetched = item < facts.processed[1] && !failedItems.has(item);
    const distributor = run.id === mixedTypesRunId && item % 3 === 2;
    return {
      name,
      type: distributor ? "Distributor" : "Supplier",
      ...(distributor
        ? { region: regions[Math.floor(item / 3) % regions.length]! }
        : {}),
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
    .filter((entity) => entity.certificate && entity.item < facts.processed[2])
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
        ...(run.id === bouncedRunId && entity.item === bouncedItem
          ? {
              delivery: "bounced" as const,
              bounce: "Mailbox not found (550 5.1.1)",
            }
          : { delivery: "sent" as const }),
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

/** Entities by type, in first-seen order. */
const byType = (rows: SupplierEntity[]) => {
  const groups = new Map<EntityTypeName, SupplierEntity[]>();
  for (const row of rows) {
    groups.set(row.type, [...(groups.get(row.type) ?? []), row]);
  }
  return [...groups.entries()].map(([type, members]) => ({
    type,
    rows: members,
  }));
};

/** "14 suppliers · 6 distributors" (take A) or "20 entities" (take B); one type is always "20 suppliers". */
const entityCount = (rows: SupplierEntity[], take: EntityTypesTake) => {
  const groups = byType(rows);
  if (groups.length <= 1) {
    return plural(rows.length, typeNoun[groups[0]?.type ?? "Supplier"]);
  }
  return take === "b"
    ? plural(rows.length, "entity", "entities")
    : groups
        .map((group) => plural(group.rows.length, typeNoun[group.type]))
        .join(" · ");
};

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
    <div
      className={css({ display: "flex", alignItems: "center", gap: "[10px]" })}
    >
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
    <div className={subjectStyle}>{file.subject}</div>
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
export const Page = ({
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
  file.kind === "certificate"
    ? file.fileName
    : `${file.contact} · ${file.supplier}`;

const fileMeta = (file: OutputFile) =>
  file.kind === "certificate"
    ? `PDF · 1 page · ${file.sizeKb} KB`
    : `Email · sent ${file.sentAt} · 1 attachment`;

const fileDetail = (file: OutputFile) =>
  file.kind === "certificate"
    ? `ISO 9001 · ${file.issuerShort} · valid to ${file.validUntil}`
    : file.subject;

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

const linkOutStyle = css({ display: "inline-flex", flexShrink: 0 });

/** A flagged output's star in a run: read-only, the editor sets it. */
const flagMarkStyle = css({
  display: "inline-flex",
  color: "neutral.fg.subtle",
  "& svg": { fill: "[currentColor]" },
});

const FlagMark = () => (
  <Tooltip content="Shown in Logs">
    <span className={flagMarkStyle} data-output-flag-mark>
      <Icon name="star" size="sm" />
    </span>
  </Tooltip>
);

const Block = ({
  title,
  action,
  flagged = false,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  /** Flagged "Show in run history" in the editor. */
  flagged?: boolean;
  children: React.ReactNode;
}) => (
  <section className={blockStyle}>
    <div className={blockHeadStyle}>
      <span
        className={cx(
          blockTitleStyle,
          css({ display: "inline-flex", alignItems: "center", gap: "1.5" }),
        )}
      >
        {title}
        {flagged ? <FlagMark /> : null}
      </span>
      {action}
    </div>
    {children}
  </section>
);

const LinkOut = ({ label, tooltip }: { label: string; tooltip: string }) => (
  <span className={linkOutStyle}>
    <TextLink leaves tooltip={tooltip}>
      {label}
    </TextLink>
  </span>
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

const typeTagStyle = css({
  flexShrink: 0,
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

const emailLeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // The certificate thumbnails' slot, so text lines up across a list of several types.
  width: "[44px]",
  color: "neutral.fg.subtle",
});

const avatarStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  borderRadius: "full",
  backgroundColor: "neutral.a10",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
});

const emailLineStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  minWidth: "[0]",
  "& > span:first-child": { minWidth: "[0]" },
});

const emailAsideStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
});

const attachmentStyle = css({
  flexShrink: 1,
  minWidth: "[0]",
  maxWidth: "[140px]",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  "& > span": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2);

/** An email in a list, by ?emailrow= take: what leads the row. */
const EmailRow = ({
  file,
  take,
  tag,
  onOpen,
}: {
  file: Email;
  take: Exclude<EmailRowTake, null>;
  tag?: string;
  onOpen: () => void;
}) => {
  const bounced = file.delivery === "bounced";
  const time = file.sentAt.slice(0, 5);
  const lead =
    take === "2" ? (
      <RunGlyph
        state={bounced ? "failed" : "done"}
        size={16}
        detail={bounced ? `Bounced · ${file.bounce ?? ""}` : `Sent ${time}`}
      />
    ) : take === "3" ? (
      <Mail size={16} aria-hidden />
    ) : (
      <span className={avatarStyle}>{initialsOf(file.contact)}</span>
    );
  // Takes 1, 3 and 4 show a status mark only when the email bounced; take 2 leads with it.
  const aside =
    bounced && take !== "2" ? (
      <span className={emailAsideStyle} data-email-bounced>
        <RunGlyph state="failed" size={12} detail={file.bounce} />
        Bounced
      </span>
    ) : (
      <span className={emailAsideStyle}>{time}</span>
    );
  return (
    <button
      type="button"
      className={cx(
        rowButtonStyle,
        css({
          width: "[calc(100% + 16px)]",
          "& > span:nth-child(2)": { minWidth: "[0]" },
        }),
        tag && css({ gridTemplateColumns: "[auto 1fr auto]" }),
      )}
      data-output-file="email"
      data-email-row={take}
      onClick={onOpen}
    >
      <span className={emailLeadStyle}>{lead}</span>
      <span>
        <span className={emailLineStyle}>
          <span className={titleLineStyle}>{file.contact}</span>
          {aside}
        </span>
        {take === "4" ? (
          <span className={emailLineStyle}>
            <span className={metaLineStyle}>{file.subject}</span>
            <span className={attachmentStyle} title={file.attachment}>
              <Paperclip size={12} aria-hidden />
              <span>{file.attachment}</span>
            </span>
          </span>
        ) : (
          <span className={metaLineStyle}>{file.subject}</span>
        )}
        {take === "3" ? (
          <span className={metaLineStyle}>{file.body[1]}</span>
        ) : null}
      </span>
      {tag ? <span className={typeTagStyle}>{tag}</span> : null}
    </button>
  );
};

/** A file as the figma-ds `_File` row: its drawn first page cropped into the 28 px square, the name and size, and
 * what it says on the second line (the recorded gap). */
const PageRow = ({
  file,
  tag,
  onOpen,
}: {
  file: OutputFile;
  tag?: string;
  onOpen: () => void;
}) => (
  <DsFileRow
    data-output-file={file.kind}
    preview={<Page file={file} width={28} framed={false} />}
    name={fileTitle(file)}
    size={
      file.kind === "certificate"
        ? `${file.sizeKb} KB`
        : `sent ${file.sentAt.slice(0, 5)}`
    }
    detail={fileDetail(file)}
    aside={tag}
    onClick={onOpen}
  />
);

const FileRow = ({
  file,
  tag,
  onOpen,
}: {
  file: OutputFile;
  /** The row's type, in a list of several types (?entitytypes=b). */
  tag?: string;
  onOpen: () => void;
}) => {
  const emailTake = useEmailRowTake();
  return file.kind === "email" && emailTake ? (
    <EmailRow file={file} take={emailTake} tag={tag} onOpen={onOpen} />
  ) : (
    <PageRow file={file} tag={tag} onOpen={onOpen} />
  );
};

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
      <div
        className={css({ display: "flex", flexDirection: "column", gap: "2" })}
      >
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
  flagged,
  onOpen,
}: {
  take: StepOutputsTake;
  files: OutputFile[];
  title: string;
  linkOut: React.ReactNode;
  footer?: string;
  flagged?: boolean;
  onOpen: (index: number) => void;
}) => {
  const [all, setAll] = useState(false);
  if (files.length === 0) {
    return (
      <Block title={title} flagged={flagged}>
        <span className={quietStyle}>None yet</span>
      </Block>
    );
  }
  if (take === "b") {
    const shown = all ? files : files.slice(0, 4);
    return (
      <Block title={title} flagged={flagged} action={linkOut}>
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
      <Block title={title} flagged={flagged} action={linkOut}>
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
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "1",
          })}
        >
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
    <Block title={title} flagged={flagged} action={linkOut}>
      <div
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        {shown.map((file, index) => (
          <FileRow
            key={file.supplier}
            file={file}
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
  flagged,
  onOpen,
}: {
  label: string;
  icon: IconName;
  count: string;
  names: string[];
  flagged?: boolean;
  onOpen: () => void;
}) => (
  <Block title={label} flagged={flagged}>
    <button
      type="button"
      className={entityRowStyle}
      data-output-entities={label}
      onClick={onOpen}
    >
      {names.length > 0 ? (
        <span className={firstLineIconStyle}>
          <Icon name={icon} size="sm" />
        </span>
      ) : (
        <Icon name={icon} size="sm" />
      )}
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
 * The viewer: a file modal, or a table of entities
 * ------------------------------------------------------------------------------------------------------------- */

type Column = {
  label: string;
  cell: (row: SupplierEntity) => React.ReactNode;
  /** A property only these types have; other types leave it out (A) or blank (B). */
  types?: EntityTypeName[];
};

/** One type's part of an output list: entities of one type, or files of one kind. */
export type OutputGroup =
  | { type: EntityTypeName; rows: SupplierEntity[]; columns: Column[] }
  | { type: "Certificate" | "Email"; files: OutputFile[] }
  | { type: "Failed"; failures: StepFailure[] };

/** A failed item with what a reader needs to fix it: the error and the input that caused it (?edgecase=3, 5). */
export type StepFailure = Failure & {
  url: string;
  attempts: number;
  at: string;
};

export type ViewerState =
  | { kind: "files"; files: OutputFile[]; index: number; from: string }
  | {
      kind: "entities";
      title: string;
      from: string;
      rows: SupplierEntity[];
      columns: Column[];
    }
  | {
      /** Outputs of more than one type: a loop step's, or a run's flagged outputs. */
      kind: "mixed";
      title: string;
      from: string;
      groups: OutputGroup[];
      /** The group to scroll to (History opens the part that was clicked). */
      focus?: string;
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
          ...(file.bounce
            ? [["Bounced", file.bounce] as [string, string]]
            : []),
          ["Attachment", file.attachment],
          ["Message ID", file.messageId],
        ];
  const bounced = file.kind === "email" && file.delivery === "bounced";
  const good =
    (file.kind === "email" && !bounced) ||
    (file.kind === "certificate" && !file.expiring);
  const tone = bounced ? "failed" : good ? "done" : "needsReview";
  return (
    <dl className={factsGridStyle}>
      <span
        className={pillStyle}
        style={{
          backgroundColor: `var(--flows-${tone}-badgeBg)`,
          color: `var(--flows-${tone}-badgeFg)`,
        }}
      >
        {file.kind === "email"
          ? bounced
            ? "Bounced"
            : "Sent"
          : good
            ? "Valid"
            : "Expires soon"}
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

type FilesView = Extract<ViewerState, { kind: "files" }>;

/** ‹ 3 of 18 ›: the files a view steps through. */
const FileNav = ({
  view,
  onChange,
  variant = "subtle",
}: {
  view: FilesView;
  onChange: (next: ViewerState) => void;
  /** Ghost in the column's header, beside ← and expand. */
  variant?: "subtle" | "ghost";
}) => {
  const go = (by: number) => {
    const index = view.index + by;
    if (index >= 0 && index < view.files.length) {
      onChange({ ...view, index });
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant={variant}
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
        variant={variant}
        tone="neutral"
        iconName="arrowRight"
        aria-label="Next file"
        tooltip="Next · →"
        disabled={view.index === view.files.length - 1}
        onClick={() => go(1)}
      />
    </>
  );
};

/** Download and Open in Files / Mail. */
const FileActions = ({ file }: { file: OutputFile }) => (
  <>
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      tooltip="MOCK: the prototype has no real files"
    >
      Download
    </Button>
    <TextLink
      leaves
      tooltip={
        file.kind === "certificate"
          ? "Opens the File entity in HASH (not in the prototype)"
          : "Opens the sent email (not in the prototype)"
      }
    >
      {file.kind === "certificate" ? "Open in Files" : "Open in Mail"}
    </TextLink>
  </>
);

/** ← → step through the files; ↑ ↓ stay out of the run view's run switching. */
const fileKeys =
  (view: FilesView, onChange: (next: ViewerState) => void) =>
  (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const index = view.index + (event.key === "ArrowLeft" ? -1 : 1);
      if (index >= 0 && index < view.files.length) {
        onChange({ ...view, index });
      }
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.stopPropagation();
    }
  };

const fileHeading = (file: OutputFile) =>
  file.kind === "certificate" ? file.fileName : file.subject;

/** The page large and its facts beside it: the modal's body, and the side sheet's. */
const FileWide = ({
  file,
  run,
  narrow = false,
}: {
  file: OutputFile;
  run: RunRecord;
  /** The 640 px side sheet: a smaller page and a narrower facts column. */
  narrow?: boolean;
}) => (
  <div
    data-output-modal={file.kind}
    className={css({
      display: "grid",
      gridTemplateColumns: narrow ? "[1fr 220px]" : "[1fr 264px]",
      minHeight: "[0]",
      // Edge to edge inside the overlay body's own padding (16 px top, 20 px bottom).
      marginTop: "[-16px]",
      marginX: "[calc(var(--panel-horizontal-padding) * -1)]",
      marginBottom: "[-20px]",
    })}
  >
    <div
      className={css({
        display: "flex",
        justifyContent: "center",
        padding: narrow ? "6" : "8",
        backgroundColor: "neutral.bgSolid.surface",
        borderBottomLeftRadius: "xl",
      })}
    >
      <Page file={file} width={narrow ? 300 : 420} />
    </div>
    <div className={css({ padding: "6" })}>
      <FileFacts file={file} run={run} />
    </div>
  </div>
);

const FileModal = ({
  view,
  run,
  onChange,
  onClose,
}: {
  view: FilesView;
  run: RunRecord;
  onChange: (next: ViewerState) => void;
  onClose: () => void;
}) => {
  const file = view.files[view.index]!;
  return (
    <Dialog
      size="lg"
      variant="plain"
      onClose={onClose}
      aria-label={fileTitle(file)}
      onKeyDown={fileKeys(view, onChange)}
    >
      <Dialog.Header
        title={fileHeading(file)}
        description={
          <RunIdsIn
            text={`${fileMeta(file)} · ${file.supplier} · ${runLabel(run)}`}
          />
        }
        actions={
          <span className={headerActionsStyle} data-output-modal-actions>
            <FileNav view={view} onChange={onChange} />
            <FileActions file={file} />
          </span>
        }
      />
      <Dialog.Body>
        <FileWide file={file} run={run} />
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

const groupLabel: Record<OutputGroup["type"], [string, string]> = {
  Supplier: ["supplier", "Suppliers"],
  Distributor: ["distributor", "Distributors"],
  Certificate: ["certificate", "Certificates"],
  Email: ["email", "Emails"],
  Failed: ["failed", "Failed"],
};

const groupSize = (group: OutputGroup) =>
  "rows" in group
    ? group.rows.length
    : "files" in group
      ? group.files.length
      : group.failures.length;

/** The type tabs (picked: `picks/entity-types` switch-b), the status tabs' family at list size: regular weight, faint fill when on. */
const typeTabsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  marginLeft: "[-8px]",
});

const typeTabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  textStyle: "sm",
  color: "neutral.fg.muted",
  cursor: "pointer",
  "& > span": { color: "neutral.fg.subtle" },
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[aria-selected=true]": {
    color: "neutral.fg.heading",
    backgroundColor: "neutral.a10",
  },
  _focusVisible: {
    outline: "none",
    boxShadow: "[0 0 0 2px var(--colors-neutral-a20)]",
  },
});

/**
 * Above a list of more than one type: one tab per type with its count ("Suppliers 14 · Distributors 6"), each showing
 * only its own rows. A single type draws no tabs.
 */
const TypeTabs = ({
  tabs,
  current,
  onPick,
  className,
}: {
  tabs: { type: OutputGroup["type"]; count: number }[];
  current: string;
  onPick: (type: OutputGroup["type"]) => void;
  className?: string;
}) => (
  <div
    role="tablist"
    aria-label="Types"
    className={cx(typeTabsStyle, className)}
  >
    {tabs.map((tab) => (
      <button
        key={tab.type}
        type="button"
        role="tab"
        aria-selected={tab.type === current}
        className={typeTabStyle}
        data-type-tab={tab.type}
        onClick={() => onPick(tab.type)}
      >
        {groupLabel[tab.type][1]}
        <span>{tab.count}</span>
      </button>
    ))}
  </div>
);

/**
 * Wide lists (modal, side sheet): the tabs sit over the tables' first column, 12 px in, so a tab's label starts at the
 * title's x (switch-b crop). The attribute selector outranks typeTabsStyle's -8 px, which used to win.
 */
const wideTabsStyle = css({
  "&[role=tablist]": { marginLeft: "[4px]" },
  marginBottom: "2",
});

/** A table wider than its sheet scrolls sideways; cells never wrap. */
const tableScrollStyle = css({ overflowX: "auto" });

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

const groupTitleStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  paddingX: "3",
  paddingTop: "5",
  paddingBottom: "1",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  "&:first-child": { paddingTop: "1" },
  "& > span": { fontWeight: "normal", color: "neutral.fg.subtle" },
});

const EntityTable = ({
  rows,
  columns,
  outputs,
  onChange,
}: {
  rows: SupplierEntity[];
  columns: Column[];
  outputs: RunOutputs;
  onChange: (next: ViewerState) => void;
}) => (
  <div className={tableScrollStyle}>
    <table className={tableStyle}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            {columns.map((column) => (
              <td key={column.label}>
                {column.types &&
                !column.types.includes(row.type) ? null : column.label ===
                    "Certificate" && row.certificate ? (
                  <button
                    type="button"
                    className={linkStyle}
                    onClick={() =>
                      onChange({
                        kind: "files",
                        files: outputs.certificates,
                        index: outputs.certificates.indexOf(row.certificate!),
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
);

/** "For each supplier · Run 2C07 · Today, 08:15"; a run's own outputs say where they are listed instead. */
const sourceLine = (from: string, run: RunRecord) =>
  `${from === `${runLabel(run)} outputs` ? "Shown in Logs" : from} · ${runLabel(run)} · ${run.when}`;

type EntitiesView = Extract<ViewerState, { kind: "entities" }>;
type MixedView = Extract<ViewerState, { kind: "mixed" }>;

/** A list of entities, wide: one table per type (A) or one table with a Type column (B). */
const EntityBody = ({
  view,
  outputs,
  onChange,
}: {
  view: EntitiesView;
  outputs: RunOutputs;
  onChange: (next: ViewerState) => void;
}) => {
  const take = useEntityTypesTake();
  const tabbed = useEntitySwitch() === "b";
  const allGroups = byType(view.rows);
  const mixed = allGroups.length > 1;
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? allGroups[0]?.type ?? "";
  // Tabs: only the picked type's table; otherwise every type stacked.
  const groups = tabbed
    ? allGroups.filter((group) => group.type === current)
    : allGroups;
  // B: one table, the Type column after the first; a column only some types have stays, blank for the rest.
  const typeColumn: Column = { label: "Type", cell: (row) => row.type };
  const flatColumns =
    mixed && take === "b"
      ? [view.columns[0]!, typeColumn, ...view.columns.slice(1)]
      : view.columns.filter((column) => !column.types || mixed);
  return (
    <div data-entity-table={mixed ? take : undefined}>
      {mixed && take === "a" && tabbed ? (
        <TypeTabs
          className={wideTabsStyle}
          tabs={allGroups.map((group) => ({
            type: group.type,
            count: group.rows.length,
          }))}
          current={current}
          onPick={setPicked}
        />
      ) : null}
      {mixed && take === "a" ? (
        // A: one table per type, each with only the columns its type has.
        groups.map((group) => (
          <section key={group.type} data-entity-group={group.type}>
            {tabbed ? null : (
              <div className={groupTitleStyle}>
                {group.type}
                <span>{group.rows.length}</span>
              </div>
            )}
            <EntityTable
              rows={group.rows}
              columns={view.columns.filter(
                (column) => !column.types || column.types.includes(group.type),
              )}
              outputs={outputs}
              onChange={onChange}
            />
          </section>
        ))
      ) : (
        <EntityTable
          rows={view.rows}
          columns={flatColumns}
          outputs={outputs}
          onChange={onChange}
        />
      )}
    </div>
  );
};

/** Each file kind's own columns, the first one opening the file. */
const FileTable = ({
  files,
  onOpen,
}: {
  files: OutputFile[];
  onOpen: (index: number) => void;
}) => {
  const certificates = files[0]?.kind === "certificate";
  return (
    <div className={tableScrollStyle}>
      <table className={tableStyle}>
        <thead>
          <tr>
            {(certificates
              ? ["File", "Supplier", "Issued by", "Valid until"]
              : ["Email", "To", "Subject", "Sent"]
            ).map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {files.map((file, index) => (
            <tr key={file.supplier}>
              <td>
                <button
                  type="button"
                  className={linkStyle}
                  data-output-file={file.kind}
                  onClick={() => onOpen(index)}
                >
                  {file.kind === "certificate" ? file.fileName : file.supplier}
                </button>
              </td>
              {file.kind === "certificate" ? (
                <>
                  <td>{file.supplier}</td>
                  <td>{file.issuerShort}</td>
                  <td>{file.validUntil}</td>
                </>
              ) : (
                <>
                  <td>{file.contact}</td>
                  <td>{file.subject}</td>
                  <td>{file.sentAt}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** "18 suppliers · 18 certificates · 18 emails" */
export const groupsCount = (groups: OutputGroup[]) =>
  groups
    .map((group) =>
      group.type === "Failed"
        ? `${groupSize(group)} failed`
        : plural(groupSize(group), groupLabel[group.type][0]),
    )
    .join(" · ");

/** An entity list as groups, one per type, each with only its type's columns. */
const entityGroups = (
  rows: SupplierEntity[],
  columns: Column[],
): OutputGroup[] =>
  byType(rows).map((group) => ({
    type: group.type,
    rows: group.rows,
    columns: columns.filter(
      (column) => !column.types || column.types.includes(group.type),
    ),
  }));

const groupsOf = (view: EntitiesView | MixedView) =>
  view.kind === "mixed" ? view.groups : entityGroups(view.rows, view.columns);

const openFilesIn =
  (onChange: (next: ViewerState) => void, files: OutputFile[], from: string) =>
  (index: number) =>
    onChange({ kind: "files", files, index, from });

/** Failed items, wide: the error and the input beside each. */
const FailureTable = ({ failures }: { failures: StepFailure[] }) => (
  <div className={tableScrollStyle}>
    <table className={tableStyle} data-failure-table>
      <thead>
        <tr>
          {["Supplier", "Error", "Input URL", "Attempts", "At"].map((label) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {failures.map((failure) => (
          <tr key={failure.supplier}>
            <td>{failure.supplier}</td>
            <td>{failure.reason}</td>
            <td>{failure.url}</td>
            <td>{failure.attempts}</td>
            <td>{failure.at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Rows a type's wide table shows before "+ N more". */
const widePeek = 5;

/** Outputs of several types, wide: A, a table per type with its own columns; B, one table with a Type column. */
const MixedBody = ({
  view,
  outputs,
  onChange,
}: {
  view: MixedView;
  outputs: RunOutputs;
  onChange: (next: ViewerState) => void;
}) => {
  const take = useEntityTypesTake();
  const tabbed = useEntitySwitch() === "b" && view.groups.length > 1;
  const [shownAll, setShownAll] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const current =
    picked ??
    view.groups.find((group) => group.type === view.focus)?.type ??
    view.groups[0]?.type ??
    "";
  if (take === "b" && view.groups.length > 1) {
    type FlatRow = {
      key: string;
      name: React.ReactNode;
      type: string;
      supplier: string | null;
      contact: string | null;
      validUntil: string | null;
      sent: string | null;
    };
    const blank = null;
    const rows = view.groups.flatMap((group): FlatRow[] =>
      "rows" in group
        ? group.rows.map((row) => ({
            key: `${group.type}.${row.name}`,
            name: <>{row.name}</>,
            type: row.type,
            supplier: blank,
            contact: row.contact,
            validUntil: blank,
            sent: blank,
          }))
        : "failures" in group
          ? group.failures.map((failure) => ({
              key: `${group.type}.${failure.supplier}`,
              name: <>{failure.supplier}</>,
              type: "Failed",
              supplier: failure.supplier,
              contact: blank,
              validUntil: blank,
              sent: blank,
            }))
          : group.files.map((file, index) => ({
              key: `${group.type}.${file.supplier}`,
              name: (
                <button
                  type="button"
                  className={linkStyle}
                  data-output-file={file.kind}
                  onClick={() =>
                    openFilesIn(
                      onChange,
                      group.files,
                      groupLabel[group.type][1],
                    )(index)
                  }
                >
                  {fileTitle(file)}
                </button>
              ),
              type: group.type,
              supplier: file.supplier,
              contact: file.kind === "email" ? file.contact : blank,
              validUntil: file.kind === "certificate" ? file.validUntil : blank,
              sent: file.kind === "email" ? file.sentAt : blank,
            })),
    );
    return (
      <div className={tableScrollStyle}>
        <table className={tableStyle} data-entity-table="b">
          <thead>
            <tr>
              {[
                "Name",
                "Type",
                "Supplier",
                "Contact",
                "Valid until",
                "Sent",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.name}</td>
                <td>{row.type}</td>
                <td>{row.supplier}</td>
                <td>{row.contact}</td>
                <td>{row.validUntil}</td>
                <td>{row.sent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // A: one table per type, cut to a few rows until "+ N more"; with tabs, only the picked type's.
  return (
    <div data-entity-table="a">
      {tabbed ? (
        <TypeTabs
          className={wideTabsStyle}
          tabs={view.groups.map((group) => ({
            type: group.type,
            count: groupSize(group),
          }))}
          current={current}
          onPick={setPicked}
        />
      ) : null}
      {(tabbed
        ? view.groups.filter((group) => group.type === current)
        : view.groups
      ).map((group) => {
        const all = shownAll.includes(group.type);
        const size = groupSize(group);
        const shown = all ? size : Math.min(size, widePeek);
        return (
          <section
            key={group.type}
            data-entity-group={group.type}
            data-output-group={group.type}
          >
            {tabbed ? null : (
              <div className={groupTitleStyle}>
                {groupLabel[group.type][1]}
                <span>{size}</span>
              </div>
            )}
            {"rows" in group ? (
              <EntityTable
                rows={group.rows.slice(0, shown)}
                columns={group.columns}
                outputs={outputs}
                onChange={onChange}
              />
            ) : "failures" in group ? (
              <FailureTable failures={group.failures.slice(0, shown)} />
            ) : group.type === "Email" ? (
              // Emails as E1 rows (inbox `picks/email-rows`, decided 5 Nov), as in the inline list: initials,
              // recipient, subject and time, "Bounced" when one bounced.
              <div className={css({ paddingX: "3" })} data-email-rows>
                {group.files.slice(0, shown).map((file, index) => (
                  <FileRow
                    key={file.supplier}
                    file={file}
                    onOpen={() =>
                      openFilesIn(
                        onChange,
                        group.files,
                        groupLabel[group.type][1],
                      )(index)
                    }
                  />
                ))}
              </div>
            ) : (
              <FileTable
                files={group.files.slice(0, shown)}
                onOpen={openFilesIn(
                  onChange,
                  group.files,
                  groupLabel[group.type][1],
                )}
              />
            )}
            <div className={css({ paddingX: "3", paddingBottom: "2" })}>
              <MoreButton
                hidden={size - shown}
                open={all}
                onToggle={() =>
                  setShownAll((open) =>
                    open.includes(group.type)
                      ? open.filter((other) => other !== group.type)
                      : [...open, group.type],
                  )
                }
              />
            </div>
          </section>
        );
      })}
    </div>
  );
};

/** A list's wide body: the modal's and the side sheet's. */
const ListWide = ({
  view,
  outputs,
  onChange,
}: {
  view: EntitiesView | MixedView;
  outputs: RunOutputs;
  onChange: (next: ViewerState) => void;
}) =>
  view.kind === "mixed" ? (
    <MixedBody view={view} outputs={outputs} onChange={onChange} />
  ) : (
    <EntityBody view={view} outputs={outputs} onChange={onChange} />
  );

const OpenInEntities = () => (
  <TextLink leaves tooltip="Opens these entities in HASH (not in the prototype)">
    Open in Entities
  </TextLink>
);

/** Today's take: a list opens in a modal. */
const ListModal = ({
  view,
  run,
  onChange,
  onClose,
  outputs,
}: {
  view: EntitiesView | MixedView;
  run: RunRecord;
  onChange: (next: ViewerState) => void;
  onClose: () => void;
  outputs: RunOutputs;
}) => (
  <Dialog size="lg" variant="plain" onClose={onClose} aria-label={view.title}>
    <Dialog.Header
      title={view.title}
      description={<RunIdsIn text={sourceLine(view.from, run)} />}
      actions={<OpenInEntities />}
    />
    <Dialog.Body>
      <div
        className={css({
          maxHeight: "[60vh]",
          overflowY: "auto",
          marginX: "[-12px]",
        })}
      >
        <ListWide view={view} outputs={outputs} onChange={onChange} />
      </div>
    </Dialog.Body>
  </Dialog>
);

const muted = (text: string) => (
  <span className={css({ color: "neutral.fg.subtle" })}>{text}</span>
);

/** The entity tables each output opens. */
export const entityViews = (outputs: RunOutputs, take: EntityTypesTake) => {
  const certificateCell = (row: SupplierEntity) =>
    row.certificate ? row.certificate.fileName : muted("None");
  return {
    suppliers: {
      kind: "entities" as const,
      title: entityCount(outputs.entities, take),
      from: "Find active suppliers",
      rows: outputs.entities,
      // Headers are property names, never the type's name (Ciarán, 4 Nov: "Name", not "Supplier").
      columns: [
        { label: "Name", cell: (row: SupplierEntity) => row.name },
        { label: "Contact", cell: (row: SupplierEntity) => row.contact },
        { label: "Email", cell: (row: SupplierEntity) => row.email },
        {
          label: "Region",
          types: ["Distributor" as const],
          cell: (row: SupplierEntity) => row.region ?? "",
        },
        { label: "Certificate", cell: certificateCell },
      ],
    },
    reviewed: {
      kind: "entities" as const,
      title: `${entityCount(outputs.updated, take)} updated`,
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
      // The read entity's Name, then the value; reading Name itself is one column.
      columns: [
        ...(property === "Name"
          ? []
          : [{ label: "Name", cell: (row: SupplierEntity) => row.name }]),
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

/** A loop's outputs: what its body made for each item, of three types (Run 16: 18 suppliers, certificates, emails). */
export const loopView = (
  outputs: RunOutputs,
  take: EntityTypesTake,
): MixedView => {
  const groups: OutputGroup[] = [
    ...entityGroups(
      outputs.updated,
      entityViews(outputs, take).reviewed.columns,
    ),
    { type: "Certificate" as const, files: outputs.certificates },
    { type: "Email" as const, files: outputs.emails },
  ].filter((group) => groupSize(group) > 0);
  return {
    kind: "mixed",
    title: groupsCount(groups),
    from: "For each supplier",
    groups,
  };
};

/** A run's flagged outputs as one list, by type; History opens it at the part that was clicked. */
const flaggedView = (
  outputs: RunOutputs,
  flags: string[],
  take: EntityTypesTake,
  focus: string | undefined,
): MixedView => {
  const views = entityViews(outputs, take);
  const groups = flags
    .flatMap((key): OutputGroup[] =>
      key === "findSuppliers.entities"
        ? entityGroups(outputs.entities, views.suppliers.columns)
        : key === "fetchCertificate.fileEntity"
          ? [{ type: "Certificate", files: outputs.certificates }]
          : key === "sendReviewEmail.messageId"
            ? [{ type: "Email", files: outputs.emails }]
            : [],
    )
    .filter((group) => groupSize(group) > 0);
  return {
    kind: "mixed",
    title: groupsCount(groups),
    from: `${runLabel(outputs.run)} outputs`,
    groups,
    ...(focus ? { focus } : {}),
  };
};

/* ----------------------------------------------------------------------------------------------------------------
 * Where the viewer opens (inbox `picks/outputs-container`), ?outputs=inline|expand|modal from the URL only; no param
 * is today's modal until Aakarsh picks.
 * - inline: the right column swaps to the output list with a back arrow (Attio's run panel); a file previews there.
 * - expand: inline, plus an expand control that opens a wide side sheet; the canvas and run stay in view beside it.
 * - modal: today's take, a dialog over everything.
 * ------------------------------------------------------------------------------------------------------------- */

export type OutputsContainer = "inline" | "expand" | "modal";

export const useOutputsContainer = (): OutputsContainer => {
  const value = useLocation().query.get("outputs")?.toLowerCase();
  return value === "inline" || value === "expand" ? value : "modal";
};

/** The right column the viewer swaps into: History's overview, or the run view's step panel. */
const columnOf = (element: HTMLElement | null): HTMLElement | null =>
  element
    ?.closest("[data-all-runs]")
    ?.querySelector<HTMLElement>(":scope > aside") ??
  element?.closest<HTMLElement>("aside") ??
  null;

type Box = {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Where the column portals: the app root, which carries the theme's fonts and colour tokens. */
  host: HTMLElement;
};

const columnStyle = css({
  position: "fixed",
  zIndex: "[30]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  outline: "none",
});

/** Lays the column over the right panel at the panel's own box, so the panel looks swapped. */
const ColumnHost = ({
  anchor,
  onKeyDown,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  onKeyDown: (event: React.KeyboardEvent) => void;
  children: (width: number) => React.ReactNode;
}) => {
  const [box, setBox] = useState<Box | null>(null);
  const hostRef = useRef<HTMLElement>(null);
  // Inside the app root, which carries the theme's fonts and colour tokens.
  const portalRef = usePortalContainerRef();
  useLayoutEffect(() => {
    const column = columnOf(anchor.current);
    if (!column) {
      return;
    }
    const host = portalRef?.current ?? document.body;
    const measure = () => {
      const rect = column.getBoundingClientRect();
      // 1 px in, so the panel's own left rule still shows.
      setBox({
        top: rect.top,
        left: rect.left + 1,
        width: rect.width - 1,
        height: rect.height,
        host,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor, portalRef]);
  const shown = box !== null;
  useEffect(() => {
    if (shown) {
      hostRef.current?.focus({ preventScroll: true });
    }
  }, [shown]);
  if (!box) {
    return null;
  }
  return createPortal(
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc and ← → for the column
    <section
      ref={hostRef}
      tabIndex={-1}
      aria-label="Outputs"
      data-outputs-column
      className={columnStyle}
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      }}
      onKeyDown={onKeyDown}
    >
      {children(box.width)}
    </section>,
    box.host,
  );
};

const columnHeadStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
  height: "[52px]",
  paddingLeft: "4",
  paddingRight: "4",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const columnTitleStyle = css({
  flex: "1",
  minWidth: "[0]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const columnBodyStyle = css({
  flex: "1",
  minHeight: "[0]",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "6",
  padding: "6",
});

const headBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const entityLineStyle = css({
  display: "grid",
  gridTemplateColumns: "[44px 1fr auto]",
  alignItems: "center",
  columnGap: "3",
  paddingY: "2",
  color: "neutral.fg.subtle",
  "& > span:first-child": { display: "flex", justifyContent: "center" },
  "& > span:nth-child(2)": { minWidth: "[0]" },
});

/** A column's value as text, for the narrow list's one-line summary. */
const cellText = (column: Column, row: SupplierEntity) => {
  const cell = column.cell(row);
  return typeof cell === "string" ? cell : "";
};

/**
 * An entity in the narrow list: its name, and the properties that fit on one line. With ?edgecase= the line is the
 * view's own properties in column order, so a wide output shows what the column cuts off.
 */
const EntityLine = ({
  row,
  tag,
  columns,
}: {
  row: SupplierEntity;
  tag?: string;
  columns?: Column[];
}) => (
  <div className={entityLineStyle} data-output-entity={row.type}>
    <span className={firstLineIconStyle}>
      <Icon name="cube" size="sm" />
    </span>
    <span>
      <span className={titleLineStyle}>{row.name}</span>
      <span className={metaLineStyle}>
        {columns
          ? columns
              .filter((column) => column.label !== "Name")
              .map((column) => cellText(column, row))
              .filter(Boolean)
              .join(" · ")
          : `${row.region ? `${row.region} · ` : ""}${row.contact} · ${row.email}`}
      </span>
    </span>
    {tag ? <span className={typeTagStyle}>{tag}</span> : <span />}
  </div>
);

const failureLineStyle = css({
  display: "grid",
  gridTemplateColumns: "[44px 1fr]",
  alignItems: "start",
  columnGap: "3",
  paddingY: "2",
  "& > span:first-child": {
    display: "flex",
    justifyContent: "center",
    paddingTop: "[2px]",
  },
  "& > span:nth-child(2)": { minWidth: "[0]" },
});

const wrapLineStyle = css({
  display: "block",
  marginTop: "0.5",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  overflowWrap: "anywhere",
});

/** A failed item in the narrow list: the error, then the input that caused it, wrapped. */
const FailureLine = ({ failure }: { failure: StepFailure }) => (
  <div className={failureLineStyle} data-output-failure>
    <span>
      <RunGlyph state="failed" size={16} detail={failure.reason} />
    </span>
    <span>
      <span className={titleLineStyle}>{failure.supplier}</span>
      <span className={metaLineStyle}>
        {failure.reason} · {plural(failure.attempts, "attempt")} · {failure.at}
      </span>
      <span className={wrapLineStyle}>{failure.url}</span>
    </span>
  </div>
);

const columnGroupHeadStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  "& > span": { fontWeight: "normal", color: "neutral.fg.subtle" },
});

const listStackStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

/** How many rows a group shows before "+ N more". */
const groupPeek = 5;

/** ?entityswitch=c: the filter trigger reads as the list's header, a quiet chevron after it. */
const typeFilterStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  alignSelf: "flex-start",
  height: "[28px]",
  marginLeft: "[-8px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  textStyle: "sm",
  color: "neutral.fg.heading",
  cursor: "pointer",
  "& > span": { color: "neutral.fg.subtle" },
  "& svg": { color: "neutral.fg.subtle" },
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[data-state=open], &[aria-expanded=true]": {
    backgroundColor: "neutral.bg.surface.hover",
  },
});
const flatPeek = 12;

/** A list in the column: by type (A), or one list with each row's type (B). */
const ColumnList = ({
  view,
  onOpen,
}: {
  view: EntitiesView | MixedView;
  onOpen: (next: ViewerState) => void;
}) => {
  const take = useEntityTypesTake();
  const edge = useEdgeCase() !== null;
  const switchTake = useEntitySwitch();
  const groups = groupsOf(view);
  const [shownAll, setShownAll] = useState<string[]>([]);
  /** The type ?entityswitch=b's tab or c's filter shows; null is the first tab (b) or all types (c). */
  const [picked, setPicked] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focus = view.kind === "mixed" ? view.focus : undefined;
  useEffect(() => {
    if (focus && switchTake !== "b") {
      listRef.current
        ?.querySelector(`[data-output-group="${focus}"]`)
        ?.scrollIntoView({ block: "start" });
    }
  }, [focus, switchTake]);
  const toggle = (key: string) =>
    setShownAll((current) =>
      current.includes(key)
        ? current.filter((other) => other !== key)
        : [...current, key],
    );
  const openFile = (group: OutputGroup & { files: OutputFile[] }) =>
    openFilesIn(onOpen, group.files, groupLabel[group.type][1]);
  if (take === "b" && groups.length > 1) {
    const items = groups.flatMap((group) =>
      "rows" in group
        ? group.rows.map((row) => (
            <EntityLine
              key={`${group.type}.${row.name}`}
              row={row}
              tag={row.type}
              {...(edge ? { columns: group.columns } : {})}
            />
          ))
        : "failures" in group
          ? group.failures.map((failure) => (
              <FailureLine key={failure.supplier} failure={failure} />
            ))
          : group.files.map((file, index) => (
              <FileRow
                key={`${group.type}.${file.supplier}`}
                file={file}
                tag={group.type}
                onOpen={() => openFile(group)(index)}
              />
            )),
    );
    const all = shownAll.includes("flat");
    return (
      <div ref={listRef} className={listStackStyle} data-column-list="b">
        {all ? items : items.slice(0, flatPeek)}
        <MoreButton
          hidden={all ? 0 : Math.max(0, items.length - flatPeek)}
          open={all}
          onToggle={() => toggle("flat")}
        />
      </div>
    );
  }
  const switching = groups.length > 1;
  const tabbed = switching && switchTake === "b";
  const opening = groups.find((group) => group.type === focus)?.type;
  const current = tabbed ? (picked ?? opening ?? groups[0]!.type) : picked;
  const visible =
    switching && switchTake !== "a" && current
      ? groups.filter((group) => group.type === current)
      : groups;
  const total = groups.reduce((sum, group) => sum + groupSize(group), 0);
  return (
    <div
      ref={listRef}
      className={css({ display: "flex", flexDirection: "column", gap: "6" })}
      data-column-list="a"
      data-entity-switch={switching ? switchTake : undefined}
    >
      {tabbed ? (
        <TypeTabs
          tabs={groups.map((group) => ({
            type: group.type,
            count: groupSize(group),
          }))}
          current={current ?? ""}
          onPick={setPicked}
        />
      ) : null}
      {switching && switchTake === "c" ? (
        <Menu
          position="bottom-start"
          items={[
            {
              id: "all",
              text: selectedLabel("All types", current === null),
              suffix: String(total),
              selected: current === null,
              onClick: () => setPicked(null),
            },
            ...groups.map((group) => ({
              id: group.type,
              text: selectedLabel(groupLabel[group.type][1], current === group.type),
              suffix: String(groupSize(group)),
              selected: current === group.type,
              onClick: () => setPicked(group.type),
            })),
          ]}
          trigger={
            <button type="button" className={typeFilterStyle} data-type-filter>
              {current
                ? groupLabel[current as OutputGroup["type"]][1]
                : "All types"}
              <span>
                {current
                  ? groupSize(groups.find((group) => group.type === current)!)
                  : total}
              </span>
              <Icon name="chevronDown" size="sm" />
            </button>
          }
        />
      ) : null}
      {visible.map((group) => {
        const all = shownAll.includes(group.type);
        const size = groupSize(group);
        const shown = all ? size : Math.min(size, groupPeek);
        return (
          <section
            key={group.type}
            data-output-group={group.type}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "2",
              scrollMarginTop: "6",
            })}
          >
            {visible.length > 1 ? (
              <div className={columnGroupHeadStyle}>
                {groupLabel[group.type][1]}
                <span>{size}</span>
              </div>
            ) : null}
            <div className={listStackStyle}>
              {"rows" in group
                ? group.rows
                    .slice(0, shown)
                    .map((row) => (
                      <EntityLine
                        key={row.name}
                        row={row}
                        {...(edge ? { columns: group.columns } : {})}
                      />
                    ))
                : "failures" in group
                  ? group.failures
                      .slice(0, shown)
                      .map((failure) => (
                        <FailureLine key={failure.supplier} failure={failure} />
                      ))
                  : group.files
                      .slice(0, shown)
                      .map((file, index) => (
                        <FileRow
                          key={file.supplier}
                          file={file}
                          onOpen={() => openFile(group)(index)}
                        />
                      ))}
            </div>
            <MoreButton
              hidden={size - shown}
              open={all}
              onToggle={() => toggle(group.type)}
            />
          </section>
        );
      })}
    </div>
  );
};

const strongTitleStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  overflowWrap: "anywhere",
});

/** The column: ← back, a title, and the list or one file. */
const OutputColumn = ({
  view,
  depth,
  run,
  width,
  onPush,
  onReplace,
  onBack,
  onExpand,
}: {
  view: ViewerState;
  /** How many views deep: 1 goes back to the step, more go back to the list. */
  depth: number;
  run: RunRecord;
  width: number;
  onPush: (next: ViewerState) => void;
  onReplace: (next: ViewerState) => void;
  onBack: () => void;
  /** Only with ?outputs=expand. */
  onExpand?: () => void;
}) => {
  const file = view.kind === "files" ? view.files[view.index]! : null;
  return (
    <>
      <div className={columnHeadStyle}>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="arrowLeft"
          aria-label="Back"
          tooltip={depth > 1 ? "Back to the list · Esc" : "Back · Esc"}
          className={css({ marginLeft: "[-6px]" })}
          onClick={onBack}
          data-outputs-back
        />
        <span className={columnTitleStyle}>{view.from}</span>
        <span className={headerActionsStyle}>
          {view.kind === "files" ? (
            <FileNav view={view} onChange={onReplace} variant="ghost" />
          ) : null}
          {onExpand ? (
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              iconName="expand"
              aria-label="Expand"
              tooltip="Open wide, beside the run"
              onClick={onExpand}
              data-outputs-expand
            />
          ) : null}
        </span>
      </div>
      <div
        // A new view starts at the top, not at the list's scroll position.
        key={`${depth}.${view.kind === "files" ? view.index : ""}`}
        className={columnBodyStyle}
      >
        {file ? (
          <>
            <div className={headBlockStyle}>
              <span className={strongTitleStyle}>{fileHeading(file)}</span>
              <span className={quietStyle}>
                {fileMeta(file)} · {file.supplier}
              </span>
            </div>
            <Page file={file} width={width - 48} />
            <FileFacts file={file} run={run} />
            <span className={css({ display: "flex", gap: "1.5" })}>
              <FileActions file={file} />
            </span>
          </>
        ) : view.kind === "files" ? null : (
          <>
            <div className={headBlockStyle}>
              <span className={strongTitleStyle}>{view.title}</span>
              <span className={quietStyle}>
                <RunIdsIn text={`${runLabel(run)} · ${run.when}`} />
              </span>
            </div>
            <ColumnList view={view} onOpen={onPush} />
          </>
        )}
      </div>
    </>
  );
};

/** The DS Drawer's md width. */
const sheetWidth = 640;

/** The wide side sheet (?outputs=expand): non-modal, so the canvas and the run stay in view and live. */
const OutputSheet = ({
  view,
  outputs,
  onPush,
  onReplace,
  onCollapse,
}: {
  view: ViewerState;
  outputs: RunOutputs;
  onPush: (next: ViewerState) => void;
  onReplace: (next: ViewerState) => void;
  onCollapse: () => void;
}) => {
  const { run } = outputs;
  const file = view.kind === "files" ? view.files[view.index]! : null;
  return (
    <Drawer
      // 640 px (`sheetWidth`): at 1440 the For each box stays in view beside it.
      size="md"
      position="right"
      variant="plain"
      showBackdrop={false}
      // A layer over the column: Esc and collapse go back to the column, whose ← then closes the outputs.
      shouldCloseOn="none"
      onClose={onCollapse}
      aria-label={
        file ? fileHeading(file) : view.kind === "files" ? "" : view.title
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCollapse();
          return;
        }
        if (view.kind === "files") {
          fileKeys(view, onReplace)(event);
        }
      }}
    >
      <Drawer.Header
        title={
          file ? fileHeading(file) : view.kind === "files" ? "" : view.title
        }
        description={
          file
            ? <RunIdsIn text={`${fileMeta(file)} · ${file.supplier} · ${runLabel(run)}`} />
            : <RunIdsIn text={sourceLine(view.from, run)} />
        }
        actions={
          <span className={headerActionsStyle} data-output-sheet-actions>
            {view.kind === "files" && file ? (
              <>
                <FileNav view={view} onChange={onReplace} />
                <FileActions file={file} />
              </>
            ) : (
              <OpenInEntities />
            )}
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="collapse"
              aria-label="Back to the column"
              tooltip="Back to the column · Esc"
              onClick={onCollapse}
              data-outputs-collapse
            />
          </span>
        }
      />
      <Drawer.Body>
        <div data-output-sheet>
          {file ? (
            <FileWide file={file} run={run} narrow />
          ) : view.kind === "files" ? null : (
            <div className={css({ marginX: "[-12px]" })}>
              <ListWide view={view} outputs={outputs} onChange={onPush} />
            </div>
          )}
        </div>
      </Drawer.Body>
    </Drawer>
  );
};

/**
 * The viewer's state and where it opens; `node` goes anywhere in the tree (the modal, the column and the sheet
 * portal out). `anchor` is an element inside the right column the inline takes swap.
 */
export const useOutputViewer = (
  outputs: RunOutputs | null,
  anchor: React.RefObject<HTMLElement | null>,
) => {
  const container = useOutputsContainer();
  const { ui } = useEditor();
  const flow = useReactFlow();
  const [stack, setStack] = useState<ViewerState[]>([]);
  const [wide, setWide] = useState(false);
  /** The canvas view before the sheet panned it, put back when the sheet closes. */
  const before = useRef<Viewport | null>(null);
  /** Pans the canvas, at the same zoom, so the selected step sits in what the sheet leaves visible. */
  const expand = () => {
    setWide(true);
    const pane = document.querySelector<HTMLElement>(".react-flow");
    const stepId = ui.selectedId;
    if (!pane || !stepId) {
      return;
    }
    const rect = pane.getBoundingClientRect();
    const visible = Math.min(rect.right, window.innerWidth - sheetWidth - 8);
    const box = flow.getNodesBounds([stepId]);
    if (box.width === 0 || visible >= rect.right) {
      return;
    }
    const viewport = flow.getViewport();
    before.current = viewport;
    const centre = rect.left + (visible - rect.left) / 2;
    const now =
      rect.left + viewport.x + (box.x + box.width / 2) * viewport.zoom;
    void flow.setViewport(
      { ...viewport, x: viewport.x + (centre - now) },
      { duration: 200 },
    );
  };
  const collapse = () => {
    setWide(false);
    if (before.current) {
      void flow.setViewport(before.current, { duration: 200 });
      before.current = null;
    }
  };
  const open = (next: ViewerState) => {
    setStack([next]);
    collapse();
  };
  const push = (next: ViewerState) => setStack((current) => [...current, next]);
  const replace = (next: ViewerState) =>
    setStack((current) => [...current.slice(0, -1), next]);
  const back = () => setStack((current) => current.slice(0, -1));
  const close = () => {
    setStack([]);
    collapse();
  };
  const view = stack.at(-1);
  if (!view || !outputs) {
    return { open, container, node: null };
  }
  if (container === "modal") {
    return {
      open,
      container,
      node:
        view.kind === "files" ? (
          <FileModal
            view={view}
            run={outputs.run}
            onChange={replace}
            onClose={close}
          />
        ) : (
          <ListModal
            view={view}
            run={outputs.run}
            outputs={outputs}
            onChange={push}
            onClose={close}
          />
        ),
    };
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      back();
      return;
    }
    if (view.kind === "files") {
      fileKeys(view, replace)(event);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.stopPropagation();
    }
  };
  return {
    open,
    container,
    node: (
      <>
        <ColumnHost anchor={anchor} onKeyDown={onKeyDown}>
          {(width) => (
            <OutputColumn
              view={view}
              depth={stack.length}
              run={outputs.run}
              width={width}
              onPush={push}
              onReplace={replace}
              onBack={back}
              {...(container === "expand" ? { onExpand: expand } : {})}
            />
          )}
        </ColumnHost>
        {container === "expand" && wide ? (
          <OutputSheet
            view={view}
            outputs={outputs}
            onPush={push}
            onReplace={replace}
            onCollapse={collapse}
          />
        ) : null}
      </>
    ),
  };
};

/* ----------------------------------------------------------------------------------------------------------------
 * A step's outputs, in the take
 * ------------------------------------------------------------------------------------------------------------- */

const panelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "6",
});

/* ----------------------------------------------------------------------------------------------------------------
 * MOCK edge cases (?edgecase=1..6)
 * ------------------------------------------------------------------------------------------------------------- */

const tierOf = (item: number) => ["A", "B", "A", "C"][item % 4]!;
const lastReviewOf = (item: number) =>
  ["Oct 2026", "Sep 2026", "Aug 2026", "Nov 2025"][item % 4]!;
const warehouses = ["Rotterdam", "Leeds", "Hamburg", "Lyon", "Malmö", "Porto"];
const kinds = [
  "Alloys",
  "Plastics",
  "Chemicals",
  "Metals",
  "Packaging",
  "Resins",
  "Minerals",
  "Fibres",
  "Coatings",
  "Textiles",
];

const certificateUrl = (name: string) =>
  `https://${slugOf(name)}.com/quality/iso9001.pdf`;

const supplierColumns = {
  name: { label: "Name", cell: (row: SupplierEntity) => row.name },
  region: {
    label: "Region",
    cell: (row: SupplierEntity) =>
      row.region ?? regions[row.item % regions.length]!,
  },
  contact: { label: "Contact", cell: (row: SupplierEntity) => row.contact },
  email: { label: "Email", cell: (row: SupplierEntity) => row.email },
  tier: { label: "Tier", cell: (row: SupplierEntity) => tierOf(row.item) },
  validTo: {
    label: "Certificate valid to",
    cell: (row: SupplierEntity) => certificateOf(row.name, row.item).validUntil,
  },
  lastReview: {
    label: "Last review",
    cell: (row: SupplierEntity) => lastReviewOf(row.item),
  },
  status: {
    label: "Status",
    cell: (row: SupplierEntity) => (row.item % 7 === 3 ? "On hold" : "Active"),
  },
};

const emailOf = (row: SupplierEntity, run: RunRecord): Email => {
  const certificate = certificateOf(row.name, row.item);
  return {
    kind: "email",
    supplier: row.name,
    item: row.item,
    contact: row.contact,
    to: row.email,
    subject: `Your monthly quality review · ${row.name}`,
    body: [
      `Hi ${row.contact.split(" ")[0]!},`,
      `Your ISO 9001 certificate is on file and valid until ${certificate.validUntil}. No action needed this month.`,
      "Thanks,\nAcme Quality",
    ],
    sentAt: clockPlus(run.startClock, 40 + row.item),
    messageId: `<r${run.id}-${String(row.item + 1).padStart(3, "0")}@mail.acme.example>`,
    attachment: certificate.fileName,
    sizeKb: certificate.sizeKb + 14,
    delivery: "sent",
  };
};

/** Each edge case: the step it sits on, and the output that step's panel opens. */
const edgeCaseOf = (
  edge: number,
  outputs: RunOutputs,
  take: EntityTypesTake,
): { stepId: string; view: EntitiesView | MixedView } => {
  const { run } = outputs;
  switch (edge) {
    case 1:
      return {
        stepId: "findSuppliers",
        view: {
          kind: "entities",
          title: `${plural(outputs.entities.length, "supplier")} · 8 properties`,
          from: "Find active suppliers",
          rows: outputs.entities,
          columns: Object.values(supplierColumns),
        },
      };
    case 2: {
      const rows = outputs.entities.map((row): SupplierEntity =>
        row.item % 3 === 2
          ? {
              ...row,
              type: "Distributor",
              region: regions[Math.floor(row.item / 3) % regions.length]!,
            }
          : row,
      );
      const distributor = ["Distributor" as const];
      const supplier = ["Supplier" as const];
      return {
        stepId: "findSuppliers",
        view: {
          kind: "entities",
          title: entityCount(rows, take),
          from: "Find active suppliers",
          rows,
          columns: [
            supplierColumns.name,
            supplierColumns.contact,
            { ...supplierColumns.email, types: supplier },
            { ...supplierColumns.tier, types: supplier },
            { ...supplierColumns.validTo, types: supplier },
            { ...supplierColumns.region, types: distributor },
            {
              label: "Warehouse",
              types: distributor,
              cell: (row: SupplierEntity) =>
                warehouses[row.item % warehouses.length]!,
            },
            {
              label: "Lead time",
              types: distributor,
              cell: (row: SupplierEntity) => `${3 + (row.item % 5)} days`,
            },
            {
              label: "Channels",
              types: distributor,
              cell: (row: SupplierEntity) =>
                row.item % 2 === 0 ? "Retail, trade" : "Trade",
            },
          ],
        },
      };
    }
    case 3: {
      const failedAt = new Map([
        [37, "Certificate link returned 404"],
        [112, "Certificate link timed out after 30 s"],
        [168, "TLS handshake failed"],
      ]);
      const all = Array.from({ length: 200 }, (_, item): SupplierEntity => {
        const name = `${suppliers[item % suppliers.length]!.split(" ")[0]!} ${kinds[Math.floor(item / suppliers.length)]!}`;
        const contact = contacts[item % contacts.length]!;
        return {
          name,
          type: "Supplier",
          item,
          contact,
          email: `${contact.split(" ")[0]!.toLowerCase()}@${slugOf(name)}.com`,
          reviewed: !failedAt.has(item),
        };
      });
      const done = all.filter((row) => row.reviewed);
      const groups: OutputGroup[] = [
        {
          type: "Failed",
          failures: all
            .filter((row) => !row.reviewed)
            .map((row) => ({
              supplier: row.name,
              item: row.item,
              reason: failedAt.get(row.item)!,
              url: certificateUrl(row.name),
              attempts: 3,
              at: clockPlus(run.startClock, 30 + row.item),
            })),
        },
        {
          type: "Supplier",
          rows: done,
          columns: [
            supplierColumns.name,
            supplierColumns.contact,
            supplierColumns.lastReview,
          ],
        },
        {
          type: "Certificate",
          files: done.map((row) => certificateOf(row.name, row.item)),
        },
        { type: "Email", files: done.map((row) => emailOf(row, run)) },
      ];
      return {
        stepId: forEachId,
        view: {
          kind: "mixed",
          title: groupsCount(groups),
          from: "For each supplier",
          groups,
        },
      };
    }
    case 4:
      return {
        stepId: "fetchCertificate",
        view: {
          kind: "mixed",
          title: plural(outputs.certificates.length, "certificate"),
          from: "Fetch certificate",
          groups: [{ type: "Certificate", files: outputs.certificates }],
        },
      };
    case 5:
      return {
        stepId: "fetchCertificate",
        view: {
          kind: "mixed",
          title: `${outputs.failures.length} failed`,
          from: "Fetch certificate",
          groups: [
            {
              type: "Failed",
              failures: outputs.failures.map((failure) => ({
                ...failure,
                url: certificateUrl(failure.supplier),
                attempts: 3,
                at: clockPlus(run.startClock, 20 + 3 * failure.item),
              })),
            },
          ],
        },
      };
    default:
      return {
        stepId: "readEmail",
        view: entityViews(outputs, take).values("Contact email"),
      };
  }
};

/** The Outputs part of a step's run panel. Returns null for steps with plain outputs (the sign-off's Decision). */
export const StepOutputs = ({
  stepId,
  outputs,
}: {
  stepId: string;
  outputs: RunOutputs;
}) => {
  const take = useStepOutputsTake();
  const typesTake = useEntityTypesTake();
  const { document } = useEditor();
  const anchor = useRef<HTMLDivElement>(null);
  const { open, node } = useOutputViewer(outputs, anchor);
  const views = entityViews(outputs, typesTake);
  const flags = flaggedOutputsOf(document);
  const flagged = (outputName: string) =>
    flags.includes(outputKey(stepId, outputName));
  const openFiles = (files: OutputFile[], from: string) => (index: number) =>
    open({ kind: "files", files, index, from });
  const names = (rows: SupplierEntity[]) => rows.map((row) => row.name);
  const edge = useEdgeCase();
  const edgeCase = edge ? edgeCaseOf(edge, outputs, typesTake) : null;
  const fileTypes = useFileTypes();
  if (fileTypes && stepId === "fetchCertificate") {
    return <MixedFileOutputs />;
  }
  let body: React.ReactNode = null;
  if (edgeCase && edgeCase.stepId === stepId) {
    const { view } = edgeCase;
    const sample = groupsOf(view).flatMap((group) =>
      "rows" in group
        ? group.rows.map((row) => row.name)
        : "files" in group
          ? group.files.map((file) => file.supplier)
          : group.failures.map((failure) => failure.supplier),
    );
    body = (
      <EntityOutput
        label={`Edge case ${edge}`}
        icon="cubes"
        count={view.title}
        names={sample}
        onOpen={() => open(view)}
      />
    );
  } else
    switch (stepId) {
      case "findSuppliers":
        body = (
          <EntityOutput
            label="Entities"
            icon="cubes"
            count={entityCount(outputs.entities, typesTake)}
            names={names(outputs.entities)}
            flagged={flagged("entities")}
            onOpen={() => open(views.suppliers)}
          />
        );
        break;
      case forEachId: {
        // What the loop's body made, three types at once: the mixed list the containers are compared on.
        const view = loopView(outputs, typesTake);
        body = (
          <EntityOutput
            label="Each supplier's outputs"
            icon="cubes"
            count={view.title}
            names={names(outputs.updated)}
            onOpen={() => open(view)}
          />
        );
        break;
      }
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
            flagged={flagged("value")}
            names={outputs.entities.map((row) => {
              const cell = view.columns.at(-1)!.cell(row);
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
            count={`${entityCount(outputs.updated, typesTake)} updated`}
            names={names(outputs.updated)}
            flagged={flagged("entityId")}
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
            flagged={flagged("fileEntity")}
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
                        <th>name</th>
                        <th>status</th>
                        <th>expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.slice(0, 3).map((file) => (
                        <tr key={file.supplier}>
                          <td>{file.supplier}</td>
                          <td>
                            {file.kind === "certificate" && file.expiring
                              ? "expiring"
                              : "valid"}
                          </td>
                          <td>
                            {file.kind === "certificate" ? file.validUntil : ""}
                          </td>
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
              flagged={flagged("messageId")}
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
    <div ref={anchor} className={panelStackStyle} data-step-outputs={take}>
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

type CellPart = {
  key: string;
  text: string;
  count: number;
  onOpen: () => void;
};

/** The parts one flagged output adds to the cell; an output the prototype has no run data for adds none. */
const partsOf = (
  key: string,
  outputs: RunOutputs,
  take: EntityTypesTake,
  open: (view: ViewerState) => void,
): CellPart[] => {
  const views = entityViews(outputs, take);
  const files = (list: OutputFile[], from: string) => () =>
    open({ kind: "files", files: list, index: 0, from });
  switch (key) {
    case "findSuppliers.entities": {
      const groups = byType(outputs.entities);
      // A: a count per type, each opening its own type's rows; B (or one type): one count.
      if (groups.length > 1 && take === "a") {
        return groups.map((group) => ({
          key: `${key}.${group.type}`,
          text: plural(group.rows.length, typeNoun[group.type]),
          count: group.rows.length,
          onOpen: () =>
            open({
              ...views.suppliers,
              title: plural(group.rows.length, typeNoun[group.type]),
              rows: group.rows,
            }),
        }));
      }
      return [
        {
          key,
          text: entityCount(outputs.entities, take),
          count: outputs.entities.length,
          onOpen: () => open(views.suppliers),
        },
      ];
    }
    case "fetchCertificate.fileEntity":
      return [
        {
          key,
          text: plural(outputs.certificates.length, "certificate"),
          count: outputs.certificates.length,
          onOpen: files(outputs.certificates, "Fetch certificate"),
        },
      ];
    case "sendReviewEmail.messageId":
      return [
        {
          key,
          text: plural(outputs.emails.length, "email"),
          count: outputs.emails.length,
          onOpen: files(outputs.emails, "Send review email"),
        },
      ];
    case "markReviewed.entityId":
      return [
        {
          key,
          text: `${outputs.updated.length} reviewed`,
          count: outputs.updated.length,
          onOpen: () => open(views.reviewed),
        },
      ];
    case "readName.value":
    case "readEmail.value":
    case "readCertificateLink.value": {
      const property =
        key === "readName.value"
          ? "Name"
          : key === "readEmail.value"
            ? "Contact email"
            : "Certificate link";
      return [
        {
          key,
          text: plural(outputs.entities.length, property.toLowerCase()),
          count: outputs.entities.length,
          onOpen: () => open(views.values(property)),
        },
      ];
    }
    default:
      return [];
  }
};

/**
 * Only the outputs flagged "Show in run history", in flow order (Ciarán, 4 Nov). Certificates and emails stay
 * separate counts until Dei says otherwise.
 */
export const RunOutputsCell = ({
  run,
  now,
}: {
  run: RunRecord;
  now: number;
}) => {
  const { document } = useEditor();
  const take = useEntityTypesTake();
  const outputs = runOutputs(run, now);
  const anchor = useRef<HTMLSpanElement>(null);
  const { open, container, node } = useOutputViewer(outputs, anchor);
  if (outputs.findFailed) {
    return (
      <span className={css({ color: "neutral.fg.subtle" })}>
        Nothing · stopped at Find active suppliers
      </span>
    );
  }
  const order = flattenSteps(document.steps).map(({ step }) => step.stepId);
  const flags = flaggedOutputsOf(document).toSorted(
    (left, right) =>
      order.indexOf(left.split(".")[0] ?? "") -
      order.indexOf(right.split(".")[0] ?? ""),
  );
  // Inline and expand open the run's flagged outputs as one list by type, at the part that was clicked.
  const focusOf = (key: string) =>
    key.startsWith("findSuppliers.entities")
      ? (key.split(".")[2] ?? "Supplier")
      : key === "fetchCertificate.fileEntity"
        ? "Certificate"
        : key === "sendReviewEmail.messageId"
          ? "Email"
          : undefined;
  const parts = flags
    .flatMap((key) => partsOf(key, outputs, take, open))
    .filter((part) => part.count > 0)
    .map((part) => {
      const focus = focusOf(part.key);
      return container === "modal" || !focus
        ? part
        : {
            ...part,
            onOpen: () => open(flaggedView(outputs, flags, take, focus)),
          };
    });
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keeps a part's click off the row
    <span
      ref={anchor}
      className={cellStyle}
      data-run-outputs={run.id}
      onClick={(event) => event.stopPropagation()}
    >
      {parts.length === 0 ? (
        <span className={css({ color: "neutral.fg.subtle" })}>
          {flags.length === 0 ? "No outputs flagged" : "Nothing yet"}
        </span>
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
