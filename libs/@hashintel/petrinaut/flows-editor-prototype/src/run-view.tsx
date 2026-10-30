/**
 * The run view's side panel: the same sections as the editor, read-only, for one run (Figma 639:23409; 26 Oct sync).
 *
 * - The status shows once, in a Status field with its chip, as in Attio's run sidebar. Each input shows the value it got; each output shows
 *   the value it gave. Where a value came from shows on hover, not always (Dei, T26).
 * - Simple values (an id, a count, a date) stay inline. A list of entities links out to a table in a drawer
 *   (Ciarán, T26: "anything that's an entity, we already have tables").
 * - A For each shows a summary ("18 of 20 done · 2 failed") and every item with a tick or a cross. Picking an item
 *   shows its own steps, and the failed one first (Ciarán, Dora, T26). Each step inside the loop has an item switcher
 *   on top, so you can move between items without going back.
 * - Retries are log lines under the step; no drill-down past that (Ciarán, T26: "the attempts look fine here").
 *
 * MOCK: the whole run (`mockRun`): no flow runs in the prototype. The flow is the Monthly supplier review.
 */
import { useState } from "react";

import {
  Button,
  Chip,
  Drawer,
  Icon,
  type IconName,
  SegmentedControl,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import { type DraftStep, findStep, stepLabel } from "./document";
import { useEditor } from "./editor-context";
import {
  HeaderTitle,
  panelHeaderStyle,
  PropertyRow,
  Section,
  typeLineStyle,
} from "./ui";

/* ----------------------------------------------------------------------------------------------------------------
 * MOCK run data
 * ------------------------------------------------------------------------------------------------------------- */

type Status = "done" | "failed" | "notReached";

type Item = {
  name: string;
  email: string;
  certificate: string;
  /** The item stopped here: Fetch file got a 404 three times. */
  failed?: boolean;
};

const items: Item[] = [
  "Northfield Chemicals",
  "Boreal Metals",
  "Acme Metals",
  "Halden Polymers",
  "Coastline Salts",
  "Verity Glassworks",
  "Kestrel Alloys",
  "Marlow Resins",
  "Pinecrest Minerals",
  "Ostara Fibres",
  "Quayside Oils",
  "Redwater Pigments",
  "Sable Ceramics",
  "Tamsin Solvents",
  "Union Carbon",
  "Vale Silica",
  "Westmark Paper",
  "Yarrow Textiles",
  "Zenith Coatings",
  "Brightwell Foods",
].map((name, index) => {
  const slug = name.toLowerCase().split(" ")[0]!;
  return {
    name,
    email: `quality@${slug}.example`,
    certificate: `https://${slug}.example/certs/2026-10.pdf`,
    failed: index === 1 || index === 12,
  };
});

const failedCount = items.filter((item) => item.failed).length;

export const mockRun = {
  title: "Run 14",
  started: "1 Nov 09:00",
  by: "Schedule · monthly",
  items,
};

/** Steps inside the loop, in order: an item that fails at Fetch file never reaches the ones after it. */
const loopOrder = [
  "readName",
  "readEmail",
  "readCertificateLink",
  "fetchCertificate",
  "sendReviewEmail",
  "markReviewed",
];

const statusIn = (stepId: string, item: Item): Status => {
  if (!item.failed) {
    return "done";
  }
  const at = loopOrder.indexOf(stepId);
  const fails = loopOrder.indexOf("fetchCertificate");
  return at < fails ? "done" : at === fails ? "failed" : "notReached";
};

type RunRow = { label: string; value: React.ReactNode; from?: string };

type StepRun = {
  status: Status;
  line: string;
  inputs: RunRow[];
  outputs: RunRow[];
  attempts?: string[];
};

const runOf = (stepId: string, item: Item): StepRun | null => {
  const status = statusIn(stepId, item);
  const notReached: StepRun = {
    status,
    line: "The item stopped at Fetch certificate",
    inputs: [],
    outputs: [],
  };
  switch (stepId) {
    case "readName":
      return {
        status,
        line: "09:00:02 · 0.1 s",
        inputs: [
          { label: "Entity", value: item.name, from: "supplier" },
          { label: "Property", value: "Name" },
        ],
        outputs: [{ label: "Value", value: item.name }],
      };
    case "readEmail":
      return {
        status,
        line: "09:00:02 · 0.1 s",
        inputs: [
          { label: "Entity", value: item.name, from: "supplier" },
          { label: "Property", value: "Contact email" },
        ],
        outputs: [{ label: "Value", value: item.email }],
      };
    case "readCertificateLink":
      return {
        status,
        line: "09:00:02 · 0.1 s",
        inputs: [
          { label: "Entity", value: item.name, from: "supplier" },
          { label: "Property", value: "Certificate link" },
        ],
        outputs: [{ label: "Value", value: item.certificate }],
      };
    case "fetchCertificate":
      return status === "failed"
        ? {
            status,
            line: "09:00:41 after 3 tries · the item stopped here",
            inputs: [
              {
                label: "URL",
                value: item.certificate,
                from: "Read certificate link › Value",
              },
            ],
            outputs: [{ label: "File", value: "None" }],
            attempts: [
              "Try 1 · 09:00:03 · 404 Not Found",
              "Try 2 · 09:00:13 · 404 Not Found",
              "Try 3 · 09:00:41 · 404 Not Found · gave up",
            ],
          }
        : {
            status,
            line: "09:00:04 · 1.4 s",
            inputs: [
              {
                label: "URL",
                value: item.certificate,
                from: "Read certificate link › Value",
              },
            ],
            outputs: [{ label: "File", value: "2026-10.pdf · 212 KB" }],
            attempts: ["Try 1 · 09:00:03 · 200 OK"],
          };
    case "sendReviewEmail":
      return status === "notReached"
        ? notReached
        : {
            status,
            line: "Sent 09:00:05 · 0.8 s",
            inputs: [
              {
                label: "To",
                value: item.email,
                from: "Read contact email › Value",
              },
              { label: "From", value: "quality@acme.example" },
              { label: "Subject", value: `Monthly review: ${item.name}` },
            ],
            outputs: [
              { label: "Message ID", value: `msg_${item.name.length}f2c4` },
              { label: "Sent at", value: "1 Nov 09:00" },
            ],
          };
    case "markReviewed":
      return status === "notReached"
        ? notReached
        : {
            status,
            line: "09:00:06 · 0.2 s",
            inputs: [{ label: "Entity", value: item.name, from: "supplier" }],
            outputs: [{ label: "Entity", value: item.name }],
          };
    default:
      return null;
  }
};

/* ----------------------------------------------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------------------------------------------- */

const statusChip = (status: Status | "running") =>
  status === "done" ? (
    <Chip size="sm" color="green">
      Done
    </Chip>
  ) : status === "failed" ? (
    <Chip size="sm" color="red">
      Failed
    </Chip>
  ) : status === "running" ? (
    // Some items failed: the DS FlowRun chip calls this Error; the detail under it says how many (Aakarsh, 30 Oct).
    <Chip size="sm" color="red">
      Error
    </Chip>
  ) : (
    <Chip size="sm">Not reached</Chip>
  );

/** D24 B (19 Oct): done = a tick in a filled green disc; failed = a bare red cross. */
const ItemMark = ({ failed }: { failed?: boolean }) =>
  failed ? (
    <span
      className={css({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "[14px]",
        height: "[14px]",
        color: "red.fg.link",
      })}
    >
      <Icon name="close" size="xs" />
    </span>
  ) : (
    // The DS has no filled check-circle icon: a green disc holding the DS "check", as D24 B draws it.
    <span
      className={css({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "[14px]",
        height: "[14px]",
        borderRadius: "full",
        backgroundColor: "green.fg.link",
        color: "white",
        "& svg": { width: "[9px]", height: "[9px]" },
      })}
    >
      <Icon name="check" size="xs" />
    </span>
  );

const valueStyle = css({
  textStyle: "sm",
  color: "neutral.fg.heading",
  overflowWrap: "anywhere",
});

const mutedStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

const runStripStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

/** The run's facts: which run, when, what started it. One quiet line; how it ended is the status. */
const RunStrip = () => (
  <div className={runStripStyle}>
    {mockRun.title} · {mockRun.started} · {mockRun.by}
  </div>
);

/**
 * The step's status, said once (Aakarsh, 30 Oct: it was said three times). As in Attio's run sidebar: a Status field
 * with the chip, the detail under it, then the run's facts (research/attio-run-view, Figma R8 665:16).
 */
const StatusSection = ({
  status,
  children,
}: {
  status: Status | "running";
  children: React.ReactNode;
}) => (
  <Section title="Status">
    <span
      className={css({
        gridColumn: "1 / -1",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "1.5",
      })}
    >
      {statusChip(status)}
      {children}
      <RunStrip />
    </span>
  </Section>
);

const Value = ({ row }: { row: RunRow }) =>
  row.from ? (
    // Where the value came from, on hover only (Dei, T26).
    <Tooltip content={`From ${row.from}`}>
      <span className={valueStyle}>{row.value}</span>
    </Tooltip>
  ) : (
    <span className={valueStyle}>{row.value}</span>
  );

const Header = ({ step }: { step: DraftStep }) => {
  const entry =
    step.kind === "action"
      ? getCatalogEntry(step.actionDefinitionId)
      : undefined;
  return (
    <div className={panelHeaderStyle}>
      <HeaderTitle icon={(entry?.icon ?? "rotate") as IconName}>
        <span className={typeLineStyle}>
          {step.kind === "for-each" ? "For each" : (entry?.title ?? "Step")}
        </span>
      </HeaderTitle>
      <span className={mutedStyle}>{stepLabel(step)}</span>
    </div>
  );
};

/** A table of the entities a step found, in a drawer (Ciarán: reuse the entity tables). */
const EntitiesDrawer = ({ onClose }: { onClose: () => void }) => (
  <Drawer onClose={onClose}>
    <Drawer.Header
      title={`Find active suppliers · ${items.length} suppliers`}
    />
    <Drawer.Body>
      <table
        className={css({
          width: "[100%]",
          textStyle: "sm",
          borderCollapse: "collapse",
        })}
      >
        <thead>
          <tr>
            {["Name", "Contact email", "Status"].map((head) => (
              <th
                key={head}
                className={css({
                  textAlign: "left",
                  paddingY: "1.5",
                  color: "neutral.fg.muted",
                  fontWeight: "medium",
                  borderBottomWidth: "thin",
                  borderBottomStyle: "solid",
                  borderBottomColor: "neutral.bd.subtle",
                })}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.name}>
              {[item.name, item.email, "Active"].map((cell) => (
                <td
                  key={cell}
                  className={css({
                    paddingY: "1.5",
                    color: "neutral.fg.body",
                    borderBottomWidth: "thin",
                    borderBottomStyle: "solid",
                    borderBottomColor: "neutral.bd.subtle",
                  })}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Drawer.Body>
  </Drawer>
);

/** Inside the loop: which item this panel shows. Failed items are named so. */
const ItemSwitcher = () => {
  const { ui, setUi } = useEditor();
  return (
    <Section title="Item">
      <PropertyRow label="Supplier">
        <Select
          size="sm"
          searchable
          aria-label="Supplier"
          items={items.map((item, index) => ({
            value: String(index),
            text: item.failed ? `${item.name} · failed` : item.name,
          }))}
          value={String(ui.runItem ?? 0)}
          onChange={(value) =>
            setUi((current) => ({ ...current, runItem: Number(value ?? 0) }))
          }
        />
      </PropertyRow>
    </Section>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Panels
 * ------------------------------------------------------------------------------------------------------------- */

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  gridColumn: "1 / -1",
});

const itemRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  border: "none",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.body",
  _hover: { backgroundColor: "neutral.bgSolid.subtle" },
  "&[data-picked]": {
    backgroundColor: "neutral.bgSolid.surface.active",
    color: "neutral.fg.heading",
  },
});

const ForEachRun = ({
  step,
}: {
  step: Extract<DraftStep, { kind: "for-each" }>;
}) => {
  const { ui, setUi } = useEditor();
  const [failedOnly, setFailedOnly] = useState(false);
  const picked = ui.runItem ?? 0;
  const item = items[picked]!;
  const shown = items
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !failedOnly || candidate.failed);
  return (
    <>
      <Header step={step} />
      <StatusSection status="running">
        <span className={valueStyle}>
          {items.length - failedCount} of {items.length} done · {failedCount}{" "}
          failed
        </span>
      </StatusSection>
      <Section
        title={`Items · ${items.length}`}
        action={
          // A filter of the list, so it reads as a control: the DS segmented control (evaluator, 26 Oct).
          <SegmentedControl
            size="sm"
            value={failedOnly ? "failed" : "all"}
            onChange={(next) => setFailedOnly(next === "failed")}
            items={[
              { value: "all", label: "All" },
              { value: "failed", label: `Failed · ${failedCount}` },
            ]}
          />
        }
      >
        <div className={listStyle} role="listbox" aria-label="Items">
          {shown.map(({ candidate, index }) => (
            <button
              key={candidate.name}
              type="button"
              role="option"
              aria-selected={index === picked}
              className={itemRowStyle}
              data-picked={index === picked || undefined}
              onClick={() =>
                setUi((current) => ({ ...current, runItem: index }))
              }
            >
              <ItemMark failed={candidate.failed} />
              <span className={css({ flex: "1" })}>{candidate.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={item.name}>
        <div className={listStyle}>
          {step.steps.map((inner) => {
            const run = runOf(inner.stepId, item);
            return (
              <button
                key={inner.stepId}
                type="button"
                className={itemRowStyle}
                onClick={() =>
                  setUi((current) => ({ ...current, selectedId: inner.stepId }))
                }
              >
                {run?.status === "notReached" ? (
                  <span
                    className={css({
                      color: "neutral.fg.subtle",
                      display: "inline-flex",
                    })}
                  >
                    <Icon name="circle" size="xs" />
                  </span>
                ) : (
                  <ItemMark failed={run?.status === "failed"} />
                )}
                <span className={css({ flex: "1" })}>{stepLabel(inner)}</span>
                {run?.status === "failed" ? (
                  <span
                    className={css({ textStyle: "xs", color: "red.fg.link" })}
                  >
                    404 after 3 tries
                  </span>
                ) : run?.status === "notReached" ? (
                  <span className={mutedStyle}>Not reached</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
};

const ActionRun = ({ step, inLoop }: { step: DraftStep; inLoop: boolean }) => {
  const { ui } = useEditor();
  const [drawer, setDrawer] = useState(false);
  if (!inLoop) {
    // Outside the loop the prototype's run has one step: Find active suppliers.
    return (
      <>
        <Header step={step} />
        <StatusSection status="done">
          <span className={valueStyle}>09:00:01 · 1.2 s</span>
        </StatusSection>
        <Section title="Inputs">
          <PropertyRow label="Entity type">
            <span className={valueStyle}>Supplier</span>
          </PropertyRow>
          <PropertyRow label="Filter">
            <span className={valueStyle}>Status is Active</span>
          </PropertyRow>
        </Section>
        <Section title="Outputs">
          <PropertyRow label="Entities">
            <span
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
              })}
            >
              <span className={valueStyle}>{items.length} suppliers</span>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setDrawer(true)}
              >
                View
              </Button>
            </span>
          </PropertyRow>
        </Section>
        {drawer ? <EntitiesDrawer onClose={() => setDrawer(false)} /> : null}
      </>
    );
  }
  const item = items[ui.runItem ?? 0]!;
  const run = runOf(step.stepId, item);
  if (!run) {
    return null;
  }
  return (
    <>
      <Header step={step} />
      <ItemSwitcher />
      <StatusSection status={run.status}>
        <span
          className={
            run.status === "failed"
              ? css({ textStyle: "sm", color: "red.fg.link" })
              : valueStyle
          }
        >
          {run.line}
        </span>
      </StatusSection>
      {run.inputs.length > 0 ? (
        <Section title="Inputs">
          {run.inputs.map((row) => (
            <PropertyRow key={row.label} label={row.label}>
              <Value row={row} />
            </PropertyRow>
          ))}
        </Section>
      ) : null}
      {run.outputs.length > 0 ? (
        <Section title="Outputs">
          {run.outputs.map((row) => (
            <PropertyRow key={row.label} label={row.label}>
              <Value row={row} />
            </PropertyRow>
          ))}
        </Section>
      ) : null}
      {run.attempts ? (
        <Section title="Attempts">
          <div className={listStyle}>
            {run.attempts.map((line) => (
              <span
                key={line}
                className={css({
                  textStyle: "xs",
                  fontFamily: "mono",
                  color: line.includes("404")
                    ? "red.fg.link"
                    : "neutral.fg.muted",
                })}
              >
                {line}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
};

export const RunPanel = () => {
  const { document, ui } = useEditor();
  const found = ui.selectedId ? findStep(document, ui.selectedId) : null;
  if (!found) {
    return (
      <>
        <div className={panelHeaderStyle}>
          <span className={typeLineStyle}>{document.name}</span>
        </div>
        <RunStrip />
      </>
    );
  }
  return found.step.kind === "for-each" ? (
    <ForEachRun key={found.step.stepId} step={found.step} />
  ) : (
    <ActionRun
      key={found.step.stepId}
      step={found.step}
      inLoop={found.parentId !== null}
    />
  );
};
