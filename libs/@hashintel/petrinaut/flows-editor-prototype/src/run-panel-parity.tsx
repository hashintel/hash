/**
 * A step's run panel with the editor's skeleton (inbox panel-parity, apply-all, 13 Nov): after Status (and For each's
 * Items), the editor's Inputs, Settings and Outputs, with the editor's labels, read-only. A value sits where the editor
 * has a control; a reference reads value first, then the tile and `Step › Output` under it, muted (t2). Picked details:
 * Q1 c, a step inside the For each with no item field of its own gets a collapsed Item row; Q4 a, empty fields keep
 * their rows with the editor's words; Q5 a, a Decision shows its value only; Q6 a, a body reads as written with its
 * chip; Q7 a, the sent emails sit under Message ID; Q8 a, For each shows Collect only and links all items' outputs
 * under Items. `?runpanel=old` keeps the hand-written run panel.
 */
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { fieldKey, itemRowOn } from "./document";
import { useEditor } from "./editor-context";
import { InlineChip } from "./inline-chips";
import { itemSourceOld, lastRunCount, ListSourceBlock } from "./list-source";
import { RunOutputRow } from "./outputs";
import { propertyPathOf } from "./property-path";
import { RefChipText, RefPath, refLook, RunRefValue } from "./ref-path";
import {
  forEachId,
  type RunFacts,
  type StepRun,
  signOffId,
  suppliers,
} from "./run-history";
import { RunGlyph } from "./run-glyph";
import { itemState } from "./foreach-switch";
import { AllItemsOutputsLink, RunOutputBody, type RunOutputs } from "./run-outputs";
import { approverName, approverPerson } from "./run-step-status";
import { PropertyRow, Section } from "./ui";

import type { StepInputSource } from "./engine";

export const runPanelOld =
  new URLSearchParams(globalThis.location.search).get("runpanel") === "old";

/** The item a step ran for, when the panel shows one item: the question's, or the one picked on the canvas. */
export type RunItem = {
  name: string;
  fields: { label: string; value: string; failed?: string }[];
};

/** MOCK: a supplier's fields the flow reads, in the shape the needs-review question gives Pinecrest Minerals'. */
export const supplierItem = (name: string): RunItem => {
  const slug = (name.split(" ")[0] ?? name).toLowerCase();
  return {
    name,
    fields: [
      { label: "Name", value: name },
      { label: "Contact email", value: `quality@${slug}.example` },
      { label: "Certificate link", value: `${slug}.example/certs/2026-10.pdf` },
    ],
  };
};

const valueStyle = css({ textStyle: "sm", color: "neutral.fg.body", overflowWrap: "anywhere" });
const emptyStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

const step = (stepId: string, outputName: string) =>
  ({ kind: "step-output", stepId, outputName }) as StepInputSource;
const itemRef = { kind: "item" } as StepInputSource;

const Value = ({ children }: { children: React.ReactNode }) => (
  <span className={valueStyle}>{children}</span>
);

/** On failure, and Ask a person's Deadline: the editor's only settings, with their one value. */
const Settings = ({ deadline = false }: { deadline?: boolean }) => (
  <Section title="Settings">
    {deadline ? (
      <PropertyRow label="Deadline">
        <Value>No deadline</Value>
      </PropertyRow>
    ) : null}
    <PropertyRow label="On failure">
      <Value>Stop the run</Value>
    </PropertyRow>
  </Section>
);

const itemButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  alignSelf: "flex-start",
  padding: "0",
  border: "none",
  background: "[transparent]",
  textStyle: "sm",
  color: "neutral.fg.body",
  cursor: "pointer",
  "& svg": { color: "neutral.fg.muted" },
  _hover: { color: "neutral.fg.heading" },
});

const itemFieldsStyle = css({
  display: "grid",
  // Stacked, the label over its value: the value column is too narrow for a URL beside a label.
  gridTemplateColumns: "[minmax(0, 1fr)]",
  rowGap: "0",
  "& [data-value]:not(:last-child)": { marginBottom: "2" },
  width: "[100%]",
  minWidth: "[0]",
  textStyle: "xs",
  lineHeight: "[18px]",
  "& [data-label]": { color: "neutral.fg.muted", whiteSpace: "nowrap" },
  "& [data-value]": { textStyle: "sm", color: "neutral.fg.body", overflowWrap: "anywhere", minWidth: "[0]" },
});

const failedStyle = css({ display: "flex", alignItems: "center", gap: "1.5", color: "neutral.fg.muted" });

/** Q1 c: the item's name, opening to its fields, then where it comes from (For each supplier › supplier). */
const ItemValue = ({ item, stepId }: { item: RunItem; stepId: string }) => {
  const [open, setOpen] = useState(false);
  const { document } = useEditor();
  const look = refLook(document, itemRef, stepId);
  return (
    <span className={css({ display: "flex", flexDirection: "column", gap: "1", minWidth: "[0]" })}>
      <button
        type="button"
        className={itemButtonStyle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-run-item
      >
        {item.name}
        <Icon name={open ? "chevronDown" : "chevronRight"} size="sm" />
      </button>
      {open ? (
        <span className={itemFieldsStyle} data-run-item-fields>
          {item.fields.map((field) => (
            <span key={field.label} className={css({ display: "contents" })}>
              <span data-label>{field.label}</span>
              <span data-value>
                {field.value}
                {field.failed ? (
                  <span className={failedStyle}>
                    <RunGlyph state="failed" size={12} tooltip={false} />
                    {field.failed}
                  </span>
                ) : null}
              </span>
            </span>
          ))}
        </span>
      ) : null}
      {look ? <RefPath look={look} muted /> : null}
    </span>
  );
};

/** Q6 a: Body as written, its reference a grey chip with the source step's icon (t2). */
const BodyAsWritten = ({ stepId }: { stepId: string }) => {
  const { document } = useEditor();
  const parts = document.templates[fieldKey(stepId, "body")] ?? [];
  return (
    <span className={css({ textStyle: "sm", color: "neutral.fg.body", lineHeight: "[24px]" })}>
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return <span key={index}>{part.text}</span>;
        }
        const look = refLook(document, part.source, stepId);
        return look ? (
          <InlineChip key={index} status={null} icon={look.icon}>
            <RefChipText look={look} />
          </InlineChip>
        ) : null;
      })}
    </span>
  );
};

const Outputs = ({ children }: { children: React.ReactNode }) => (
  <Section title="Outputs">
    <div className={css({ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "2" })}>
      {children}
    </div>
  </Section>
);

const NoneYet = () => (
  <span className={css({ textStyle: "sm", color: "neutral.fg.subtle", paddingLeft: "[34px]" })}>None yet</span>
);

/** For each's Items addition (Q8 a), drawn by the run panel right under the item list. */
export { AllItemsOutputsLink };

/** The item For each's run panel names: the first failed one, as its Items list opens on. */
const forEachItemName = (facts: RunFacts) => {
  const first = facts.failures[0]?.item ?? 0;
  return { name: suppliers[first] ?? "", state: itemState(facts, first) };
};

export const ParitySections = ({
  stepId,
  facts,
  state,
  outputs,
  item,
}: {
  stepId: string;
  facts: RunFacts;
  state: StepRun;
  outputs: RunOutputs;
  item?: RunItem;
}) => {
  const { document } = useEditor();
  const { n } = facts;
  const reached = state.state !== "notReached";
  const made = (count: number) => (reached ? count : undefined);
  const updated = reached ? outputs.updated.length : 0;
  const body = (outputName: string) =>
    reached ? <RunOutputBody stepId={stepId} outputName={outputName} outputs={outputs} /> : <NoneYet />;

  if (stepId === "findSuppliers") {
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label="Entity type">
            <Value>Supplier</Value>
          </PropertyRow>
          <PropertyRow label="Where">
            <Value>Status is Active</Value>
          </PropertyRow>
        </Section>
        <Settings />
        <Outputs>
          <RunOutputRow
            stepId={stepId}
            outputName="entities"
            label="Entities"
            kind="List of Suppliers"
            count={made(outputs.entities.length)}
          >
            {body("entities")}
          </RunOutputRow>
        </Outputs>
      </>
    );
  }

  if (stepId === forEachId) {
    const current = forEachItemName(facts);
    const look = document ? refLook(document, step("findSuppliers", "entities"), forEachId) : null;
    const collected = refLook(document, step("markReviewed", "entityId"), forEachId);
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label="List">
            {itemSourceOld ? (
              <RunRefValue value={`${n} suppliers`} source={step("findSuppliers", "entities")} stepId={forEachId} />
            ) : (
              <ListSourceBlock
                look={look}
                count={lastRunCount(step("findSuppliers", "entities")) ?? n}
                failed={facts.failures.length}
                readOnly
              />
            )}
          </PropertyRow>
          {itemSourceOld || !itemRowOn ? null : (
          <PropertyRow label="Item">
            <span className={css({ display: "flex", alignItems: "center", gap: "1.5", textStyle: "sm" })}>
              <span className={css({ color: "neutral.fg.heading" })}>supplier</span>
              {reached && current.name ? (
                <>
                  <span className={css({ color: "neutral.fg.subtle" })}>·</span>
                  <RunGlyph state={current.state} size={12} tooltip={false} />
                  <span className={css({ color: "neutral.fg.body" })}>{current.name}</span>
                </>
              ) : null}
            </span>
          </PropertyRow>
          )}
        </Section>
        <Section title="Settings">
          <span className={emptyStyle}>None</span>
        </Section>
        <Section title="Outputs">
          <PropertyRow label="Collect">
            <span className={css({ display: "flex", flexDirection: "column", gap: "1", textStyle: "sm" })}>
              <span className={css({ color: "neutral.fg.body" })}>
                {reached ? `${updated} suppliers` : "None yet"}
              </span>
              {collected ? <RefPath look={collected} muted /> : null}
            </span>
          </PropertyRow>
        </Section>
      </>
    );
  }

  if (stepId === "readName" || stepId === "readEmail" || stepId === "readCertificateLink") {
    const property =
      stepId === "readName" ? "Name" : stepId === "readEmail" ? "Contact email" : "Certificate link";
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label="Entity">
            {item ? (
              <RunRefValue value={item.name} source={itemRef} stepId={stepId} />
            ) : (
              <RunRefValue value={`${n} suppliers`} source={itemRef} stepId={stepId} />
            )}
          </PropertyRow>
          <PropertyRow label="Property">
            <Value>{propertyPathOf("Supplier", property)}</Value>
          </PropertyRow>
        </Section>
        <Settings />
        <Outputs>
          <RunOutputRow
            stepId={stepId}
            outputName="value"
            label={property}
            kind="Text"
            count={item ? undefined : made(outputs.entities.length)}
          >
            {item ? <NoneYet /> : body("value")}
          </RunOutputRow>
        </Outputs>
      </>
    );
  }

  if (stepId === "fetchCertificate") {
    const link = item?.fields.find((field) => field.label === "Certificate link")?.value;
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label="Item">
            {item ? (
              <ItemValue item={item} stepId={stepId} />
            ) : (
              <RunRefValue value={`${n} suppliers`} source={itemRef} stepId={stepId} />
            )}
          </PropertyRow>
          <PropertyRow label="URL">
            <RunRefValue
              value={link ?? `${n} links`}
              source={step("readCertificateLink", "value")}
              stepId={stepId}
            />
          </PropertyRow>
        </Section>
        <Settings />
        <Outputs>
          <RunOutputRow
            stepId={stepId}
            outputName="fileEntity"
            label="File entity"
            kind="Saved entity"
            count={item ? undefined : made(outputs.certificates.length)}
          >
            {item ? <NoneYet /> : body("fileEntity")}
          </RunOutputRow>
        </Outputs>
      </>
    );
  }

  if (stepId === "sendReviewEmail") {
    const email = item?.fields.find((field) => field.label === "Contact email")?.value;
    const sent = made(outputs.emails.length);
    return (
      <>
        <Section title="Inputs" gridClassName={css({ rowGap: "4" })}>
          <PropertyRow label="Item">
            {item ? (
              <ItemValue item={item} stepId={stepId} />
            ) : (
              <RunRefValue value={`${n} suppliers`} source={itemRef} stepId={stepId} />
            )}
          </PropertyRow>
          <PropertyRow label="To">
            <RunRefValue
              value={email ?? `${n} addresses`}
              source={step("readEmail", "value")}
              stepId={stepId}
            />
          </PropertyRow>
          <PropertyRow label="Subject">
            <Value>Your monthly quality review</Value>
          </PropertyRow>
          <PropertyRow label="Body">
            <BodyAsWritten stepId={stepId} />
          </PropertyRow>
          <PropertyRow label="Sender address">
            <Value>quality@acme.example</Value>
          </PropertyRow>
        </Section>
        <Settings />
        <Outputs>
          <RunOutputRow stepId={stepId} outputName="messageId" label="Message ID" kind="Text" count={sent}>
            {body("messageId")}
          </RunOutputRow>
          <RunOutputRow stepId={stepId} outputName="sentAt" label="Sent at" kind="Date Time" count={sent} />
        </Outputs>
      </>
    );
  }

  if (stepId === "markReviewed") {
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label="Entity">
            <RunRefValue value={item?.name ?? `${n} suppliers`} source={itemRef} stepId={stepId} />
          </PropertyRow>
          <PropertyRow label="Property values">
            <span className={css({ display: "flex", flexDirection: "column", gap: "0.5", minWidth: "[0]" })}>
              <span className={css({ textStyle: "xs", color: "neutral.fg.muted" })}>Last reviewed</span>
              <RunRefValue
                value="November 2026"
                source={{ kind: "flow-input", inputName: "reviewMonth" } as StepInputSource}
                stepId={stepId}
              />
            </span>
          </PropertyRow>
        </Section>
        <Settings />
        <Outputs>
          <RunOutputRow stepId={stepId} outputName="entityId" label="Entity" kind="Entity" count={made(updated)}>
            {body("entityId")}
          </RunOutputRow>
        </Outputs>
      </>
    );
  }

  if (stepId === signOffId) {
    const decision =
      state.state === "done"
        ? "Approved"
        : state.state === "failed"
          ? "None · nobody answered in 48 h"
          : null;
    return (
      <>
        <Section title="Inputs">
          <PropertyRow label={approverPerson ? "People" : "Person"}>
            <Value>{approverName}</Value>
          </PropertyRow>
          <PropertyRow label={approverPerson ? "Instructions" : "Question"}>
            <Value>Check this month's certificates and sign off.</Value>
          </PropertyRow>
          <PropertyRow label="Entity">
            <span className={emptyStyle}>None</span>
          </PropertyRow>
        </Section>
        <Settings deadline />
        <Outputs>
          <RunOutputRow stepId={stepId} outputName="decision" label="Decision" kind="Choice">
            {decision ? (
              <span className={css({ textStyle: "sm", color: "neutral.fg.body", paddingLeft: "[34px]" })}>
                {decision}
              </span>
            ) : (
              <NoneYet />
            )}
          </RunOutputRow>
        </Outputs>
      </>
    );
  }

  return null;
};
