/**
 * Branching, as a step's output (Figma 637:22029, option B; 23 + 26 Oct syncs):
 *
 * - A step's paths are the values of one output: Ask a person's Decision is Approved or Rejected; If's Result is Yes
 *   or No. The paths hang under that output row, so they sit next to the value they branch on (Ciarán, T26), and the
 *   panel keeps its three sections.
 * - Each path is one line on the rail: a dot, the value, then the step it leads to (a chip), or "Ends here". No "→"
 *   arrows and no connecting words: the rail and the order carry it (Aakarsh, T26: not a fan of the arrows).
 * - If is I1 (inbox `picks/if-panel`, decided 4 Nov): no output label and no dots. Each path is one line: its name,
 *   a muted "true" or "false" 12 px after it, then where it leads. The names share one column, so the targets line up.
 * - MOCK, the stretch case (Ciarán, Dei, T26): "Add path" adds a path on several fields, e.g. Approved AND Amount over
 *   10,000 → another reviewer. It lives in this panel only: the engine has one port per value, and the canvas card
 *   does not draw the extra port.
 */
import { Fragment, useState } from "react";

import {
  Button,
  Chip,
  Icon,
  type IconName,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import {
  findStep,
  flattenSteps,
  stepLabel,
  updateStep,
} from "./document";
import { useEditor } from "./editor-context";
import { useRunView } from "./history-view";
import { pathsTake } from "./paths-flags";
import { useLocation } from "./router";
import { pathRenamable } from "./switch-flags";
import { InlineRename, PropertyRow, Section } from "./ui";
import { UsedInBlock, useOldUsedIn } from "./used-in";

/** The output a step branches on, per action. The engine models the values as ports. */
export const branchOutput: Record<string, { label: string; kind: string }> = {
  requestReview: { label: "Decision", kind: "Choice" },
  if: { label: "Result", kind: "Yes or no" },
};

const railStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1.5",
  minWidth: "[0]",
  paddingLeft: "2",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
});

const pathStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1.5",
  minWidth: "[0]",
  textStyle: "sm",
  color: "neutral.fg.body",
});

/** The wired paths: dot, name, then where it leads (a 32 px dropdown, step icon inside), names in one column. */
const pathGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[6px auto minmax(0, 1fr)]",
  columnGap: "2",
  rowGap: "1.5",
  alignItems: "center",
  alignSelf: "stretch",
  textStyle: "sm",
  color: "neutral.fg.body",
});

const pathTargetCellStyle = css({ display: "flex", minWidth: "[0]" });

/** A path's mark: a small solid dot, as the ports on the canvas card. */
const dotStyle = css({
  flexShrink: 0,
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  backgroundColor: "neutral.fg.subtle",
});

const goesToStyle = css({ color: "neutral.fg.subtle" });

/** A two-field path: a dot column, then the condition and, under it, where it leads, both on one text edge. */
const extraStyle = css({
  display: "grid",
  gridTemplateColumns: "6px minmax(0, 1fr)",
  columnGap: "1.5",
  rowGap: "1",
  alignItems: "start",
  // The dot sits on the condition's first line, as on the paths above.
  "& > [aria-hidden]": { marginTop: "[9px]" },
});

const labelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
});

/**
 * I1 (inbox `if-panel`, picked crop `screenshots/fidelity-1105/09-if-I1.png`): name, muted value, target; one column
 * each, one path every 40 px. The name is neutral s120 (#202020), the value fg.muted (#8d8d8d).
 */
const ifPathsStyle = css({
  display: "grid",
  gridTemplateColumns: "[max-content max-content minmax(0, 1fr)]",
  gridAutoRows: "[40px]",
  alignItems: "center",
  columnGap: "3",
  rowGap: "0",
  textStyle: "sm",
  color: "neutral.s120",
  "& > [data-path-target]": {
    display: "flex",
    alignItems: "center",
    minWidth: "[0]",
    paddingLeft: "3",
  },
});

const pathValueStyle = css({ color: "neutral.fg.muted" });

/** I1's target: a 32 px Select across the rest of the row, with the step's icon. */
const ifTargetStyle = css({
  flex: "1",
  minWidth: "[0]",
  "& > button, & [data-part='trigger']": { height: "[32px]" },
});

/** Where a port leads: a dropdown of the step it is wired to, or "Ends here". */
const useGoesTo = (stepId: string, iconOf: (id: string) => IconName) => {
  const { document } = useEditor();

  return (port: string) => {
    const targets = document.wires.filter(
      (wire) => wire.source === stepId && wire.sourcePort === port,
    );
    if (targets.length === 0) {
      return <span className={goesToStyle}>Ends here</span>;
    }
    // A dropdown per path, as If's (11 Nov convergence A2): the panel picks the next step (L504), unlike Used in (L506).
    return (
      <IfTarget
        stepId={stepId}
        port={port}
        label={port}
        iconOf={iconOf}
        fallback={<span className={goesToStyle}>Ends here</span>}
      />
    );
  };
};

/** A run, a past version or the old run view is read-only: nothing is added or disconnected from the panel. */
const useReadOnlyPanel = () => {
  const { ui } = useEditor();
  const runView = useRunView();
  const viewingVersion = useLocation().query.has("version");
  return Boolean(runView) || viewingVersion || !!ui.run;
};

const valuesStyle = css({
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

/**
 * `?paths=i2|cr|attio`: the output the step branches on, listed as data with its values, drawn as the other outputs
 * are (T1 + K3, `used-in.tsx`): type icon, name, kind chip, the values at the row's end, then the steps that read it.
 * `?usedin=old` keeps the label-column row.
 */
const DecisionRow = ({
  stepId,
  actionDefinitionId,
  ports,
  iconOf,
}: {
  stepId: string;
  actionDefinitionId: string;
  ports: { outputName: string; label: string }[];
  iconOf: (id: string) => IconName;
}) => {
  const oldUsedIn = useOldUsedIn();
  const readOnly = useReadOnlyPanel();
  const output = branchOutput[actionDefinitionId];
  if (!output) {
    return null;
  }
  if (!oldUsedIn) {
    return (
      <UsedInBlock
        stepId={stepId}
        outputName={output.label.toLowerCase()}
        label={output.label}
        kind={output.kind}
        typeIcon="list"
        readOnly={readOnly}
        iconOf={iconOf}
        end={
          <span className={valuesStyle}>
            {ports.map((port) => port.label).join(" · ")}
          </span>
        }
      />
    );
  }
  return (
    <PropertyRow
      label={
        <span className={labelStackStyle}>
          <span>{output.label}</span>
          <Chip size="xs" variant="soft">
            {output.kind}
          </Chip>
        </span>
      }
      hover={`${output.label} · ${ports.map((port) => port.label).join(" or ")}`}
    >
      <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
        {ports.map((port) => port.label).join(" · ")}
      </span>
    </PropertyRow>
  );
};

/**
 * I1's target for a connected path: a 32 px Select holding the step it leads to, with that step's icon; picking
 * another step moves the path there. An open path keeps "Ends here" as text: the picked crop shows no Select for one.
 */
const IfTarget = ({
  stepId,
  port,
  label,
  iconOf,
  fallback,
}: {
  stepId: string;
  port: string;
  label: string;
  iconOf: (id: string) => IconName;
  fallback: React.ReactNode;
}) => {
  const { document, setDocument } = useEditor();
  const readOnly = useReadOnlyPanel();
  const wire = document.wires.find(
    (candidate) => candidate.source === stepId && candidate.sourcePort === port,
  );
  if (!wire) {
    return fallback;
  }
  const items = flattenSteps(document.steps)
    .filter(({ step }) => step.stepId !== stepId)
    .map(({ step }) => ({ value: step.stepId, text: stepLabel(step) }));
  return (
    <span className={ifTargetStyle}>
      <Select
        size="sm"
        width="fullWidth"
        aria-label={`${label} leads to`}
        readonly={readOnly}
        prefix={{ iconName: iconOf(wire.target) }}
        items={items}
        value={wire.target}
        onChange={(target) => {
          if (!target) {
            return;
          }
          setDocument((current) => ({
            ...current,
            wires: current.wires.map((candidate) =>
              candidate.id === wire.id
                ? {
                    ...candidate,
                    id: `${stepId}:${port}->${target}`,
                    target,
                  }
                : candidate,
            ),
          }));
        }}
      />
    </span>
  );
};

/** In-place names sit where plain text would: the field's 8 px inset is pulled back out. */
const ifRenameStyle = css({
  "&[class]": {
    marginLeft: "[-8px]",
    marginRight: "[-8px]",
    fontWeight: "normal",
    color: "neutral.s120",
  },
  "&[data-rename-input]": { minWidth: "[96px]" },
});

/**
 * `?ifrename=a|b` (inbox `if-rename-description`): a path's name, renamed in place on hover (Attio), no pen. The card's
 * port takes the name. No, the catch-all, stays fixed text with `a`.
 */
const IfPathName = ({
  stepId,
  port,
}: {
  stepId: string;
  port: { outputName: string; label: string };
}) => {
  const { setDocument } = useEditor();
  const readOnly = useReadOnlyPanel();
  if (readOnly || !pathRenamable(port.outputName)) {
    return <span>{port.label}</span>;
  }
  return (
    <InlineRename
      value={port.label}
      label={`${port.label} path name`}
      className={ifRenameStyle}
      onSave={(next) =>
        setDocument((document) =>
          updateStep(document, stepId, (step) =>
            step.kind === "action"
              ? {
                  ...step,
                  pathNames: { ...step.pathNames, [port.outputName]: next },
                }
              : step,
          ),
        )
      }
    />
  );
};

type ExtraPath = { id: string };

export const BranchRows = ({
  stepId,
  actionDefinitionId,
  ports,
  iconOf,
}: {
  stepId: string;
  actionDefinitionId: string;
  ports: { outputName: string; label: string }[];
  iconOf: (id: string) => IconName;
}) => {
  const [extras, setExtras] = useState<ExtraPath[]>([]);
  const output = branchOutput[actionDefinitionId] ?? {
    label: "Paths",
    kind: ports.map((port) => port.label).join(" or "),
  };
  const goesTo = useGoesTo(stepId, iconOf);

  const approved = ports[0];

  // `?paths=i2|cr|attio`: Decision is listed as data only; i2 puts its paths in their own section, cr on the canvas,
  // attio in Next step.
  if (actionDefinitionId !== "if" && pathsTake !== "b") {
    return (
      <DecisionRow
        stepId={stepId}
        actionDefinitionId={actionDefinitionId}
        ports={ports}
        iconOf={iconOf}
      />
    );
  }

  // `?paths=attio`: If's paths are its Next step slots.
  if (actionDefinitionId === "if" && pathsTake === "attio") {
    return null;
  }

  if (actionDefinitionId === "if") {
    return (
      <div className={ifPathsStyle} data-if-paths="i1">
        {ports.map((port) => (
          <Fragment key={port.outputName}>
            <IfPathName stepId={stepId} port={port} />
            <span className={pathValueStyle}>{port.outputName}</span>
            <span data-path-target>
              <IfTarget
                stepId={stepId}
                port={port.outputName}
                label={port.label}
                iconOf={iconOf}
                fallback={goesTo(port.outputName)}
              />
            </span>
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <PropertyRow
      label={
        <span className={labelStackStyle}>
          <span>{output.label}</span>
          <Chip size="xs" variant="soft">
            {output.kind}
          </Chip>
        </span>
      }
    >
      <div className={railStyle}>
        <div className={pathGridStyle}>
          {ports.map((port) => (
            <Fragment key={port.outputName}>
              <span className={dotStyle} aria-hidden="true" />
              <span>{port.label}</span>
              <span className={pathTargetCellStyle}>{goesTo(port.outputName)}</span>
            </Fragment>
          ))}
        </div>
        {extras.map((extra) => (
          // MOCK: a path on two fields. Shown here only; no port on the canvas.
          // MOCK: a path on two fields, drawn like the other paths: the dot, the value, then the AND chip of the
          // filter rows and the second field's condition; where it leads sits under it, in the same text column.
          <div key={extra.id} className={extraStyle}>
            <span className={dotStyle} aria-hidden="true" />
            <span className={pathStyle}>
              <span>{approved?.label ?? "Approved"}</span>
              <Chip size="md" suffix={{ iconName: "chevronDown" }}>
                AND
              </Chip>
              <span>Amount is over 10,000</span>
            </span>
            <span />
            <span className={pathStyle}>
              <span className={goesToStyle}>Ends here</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setExtras((current) =>
                    current.filter((candidate) => candidate.id !== extra.id),
                  )
                }
              >
                Remove
              </Button>
            </span>
          </div>
        ))}
        {actionDefinitionId === "requestReview" ? (
          <Button
            size="xs"
            variant="subtle"
            iconName="plus"
            onClick={() =>
              setExtras((current) => [
                ...current,
                { id: `extra${current.length}` },
              ])
            }
          >
            Add path
          </Button>
        ) : null}
      </div>
    </PropertyRow>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * `?paths=attio`: Next step, one slot per path (Attio study, 5 Nov, section 4)
 * ------------------------------------------------------------------------------------------------------------- */

// token-guard: allow the outputs playground's 12 % tree wire (`used-in.tsx`); no DS step is .12.
const slotWire = "[rgba(0, 0, 0, 0.12)]";

const slotsStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

/** The path's name as a small bordered chip, as the card's port row names it. */
const pathChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  height: "[20px]",
  paddingX: "1.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
});

/** The slot under its chip: a faint elbow from the chip's left edge, as the Outputs tree draws its rows. */
const slotRowStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "1",
  paddingLeft: "[24px]",
  marginTop: "1",
  "&::before": {
    content: '""',
    position: "absolute",
    left: "[7.5px]",
    top: "[-4px]",
    height: "[18px]",
    width: "[1px]",
    backgroundColor: slotWire,
  },
  "&::after": {
    content: '""',
    position: "absolute",
    left: "[7.5px]",
    top: "[14px]",
    width: "[12px]",
    height: "[1px]",
    backgroundColor: slotWire,
  },
  "& [data-slot-remove]": { visibility: "hidden" },
  "&:hover [data-slot-remove], &:focus-within [data-slot-remove]": {
    visibility: "visible",
  },
});

/** One 28 px line for both states, so a slot keeps its height when it fills. */
const slotButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flex: "1",
  minWidth: "[0]",
  gap: "2",
  height: "[28px]",
  paddingX: "1.5",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[data-empty]": {
    color: "neutral.fg.muted",
    opacity: "[0.7]",
    _hover: { opacity: "[1]", color: "neutral.fg.heading" },
  },
  "& > [data-name]": {
    minWidth: "[0]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const slotTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[14px]",
  height: "[14px]",
  borderRadius: "[3px]",
  "& svg": {
    width: "[10px !important]",
    minWidth: "[10px]",
    height: "[10px !important]",
  },
});

const slotRemoveStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[24px]",
  height: "[24px]",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  color: "neutral.fg.subtle",
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
});

/** The Outputs tree's tile colours: orange for Fetch file, If and Ask a person, green for other actions. */
const slotTile = (actionDefinitionId: string | undefined): React.CSSProperties =>
  actionDefinitionId &&
  getCatalogEntry(actionDefinitionId)?.tone === "orange"
    ? {
        backgroundColor: "var(--colors-orange-s20)",
        color: "var(--colors-orange-s100)",
      }
    : {
        backgroundColor: "var(--colors-green-s20)",
        color: "var(--colors-green-s100)",
      };

/**
 * Next step (Attio's panel, 5 Nov): one slot per path, in the card's order. Each slot is the path's name, then the
 * step it leads to (× disconnects, on hover) or "Select next step", which opens the step picker for that path. An
 * empty slot is where the flow ends; it is not a problem.
 */
const NextStepSection = ({
  stepId,
  ports,
  iconOf,
}: {
  stepId: string;
  ports: { outputName: string; label: string }[];
  iconOf: (id: string) => IconName;
}) => {
  const { document, setDocument, setUi } = useEditor();
  const readOnly = useReadOnlyPanel();
  return (
    <Section title="Next step">
      <div className={slotsStyle}>
        {ports.map((port) => {
          const wires = document.wires.filter(
            (wire) => wire.source === stepId && wire.sourcePort === port.outputName,
          );
          return (
            <div key={port.outputName} data-slot={port.outputName}>
              <span className={pathChipStyle}>{port.label}</span>
              {wires.map((wire) => {
                const target = findStep(document, wire.target)?.step;
                return (
                  <div key={wire.id} className={slotRowStyle}>
                    <button
                      type="button"
                      className={slotButtonStyle}
                      onClick={() =>
                        setUi((ui) => ({
                          ...ui,
                          selectedId: wire.target,
                          openField: null,
                        }))
                      }
                    >
                      <span
                        className={slotTileStyle}
                        style={slotTile(
                          target?.kind === "action"
                            ? target.actionDefinitionId
                            : undefined,
                        )}
                      >
                        <Icon name={iconOf(wire.target)} size="sm" />
                      </span>
                      <span data-name>
                        {target ? stepLabel(target) : wire.target}
                      </span>
                    </button>
                    {readOnly ? null : (
                      <button
                        type="button"
                        aria-label={`Disconnect ${port.label}`}
                        className={slotRemoveStyle}
                        data-slot-remove
                        onClick={() =>
                          setDocument((current) => ({
                            ...current,
                            wires: current.wires.filter(
                              (candidate) => candidate.id !== wire.id,
                            ),
                          }))
                        }
                      >
                        <Icon name="close" size="xs" />
                      </button>
                    )}
                  </div>
                );
              })}
              {wires.length === 0 && !readOnly ? (
                <div className={slotRowStyle}>
                  <button
                    type="button"
                    className={slotButtonStyle}
                    data-empty
                    onClick={() =>
                      setUi((ui) => ({
                        ...ui,
                        openField: null,
                        picker: {
                          after: { stepId, port: port.outputName },
                          anchor: "port",
                        },
                      }))
                    }
                  >
                    <Icon name="plus" size="sm" />
                    Select next step
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

/** One I2 path: its name and where it leads on one line, its condition under it. No nested edges inside. */
const pathCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  textStyle: "sm",
  color: "neutral.fg.body",
});

const pathHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minHeight: "[24px]",
  minWidth: "[0]",
});

const whenStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  minWidth: "[0]",
});

const pathsListStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  "& > [data-path-card]": { alignSelf: "stretch" },
});

type AddedPath = { id: string; value: string | null };

/**
 * `?paths=i2` (Figma I2 `748:30752`, 1 Nov; 3 Nov call): Ask a person's paths in their own section under Outputs.
 * Each path matches one Decision value (enum only for v1) and leads to the step wired to its port; Otherwise is
 * last. MOCK: Add path adds a card whose value is picked from the Decision values; it draws no port.
 */
export const PathsSection = ({
  stepId,
  actionDefinitionId,
  ports,
  iconOf,
}: {
  stepId: string;
  actionDefinitionId: string;
  ports: { outputName: string; label: string }[];
  iconOf: (id: string) => IconName;
}) => {
  const goesTo = useGoesTo(stepId, iconOf);
  const [added, setAdded] = useState<AddedPath[]>([]);
  const output = branchOutput[actionDefinitionId];
  if (pathsTake === "attio") {
    return <NextStepSection stepId={stepId} ports={ports} iconOf={iconOf} />;
  }
  if (pathsTake !== "i2" || actionDefinitionId === "if" || !output) {
    return null;
  }
  const paths = ports.filter((port) => port.outputName !== "otherwise");
  return (
    <Section title="Paths">
      <div className={pathsListStyle}>
        {paths.map((port) => (
          <div key={port.outputName} className={pathCardStyle} data-path-card>
            <div className={pathHeadStyle}>
              <span>{port.label}</span>
              <span className={css({ display: "flex", minWidth: "[0]" })}>
                {goesTo(port.outputName)}
              </span>
            </div>
            <div className={whenStyle}>
              <span className={goesToStyle}>When</span>
              <span>{output.label}</span>
              <span className={goesToStyle}>is</span>
              <span>{port.label}</span>
            </div>
          </div>
        ))}
        {added.map((path, index) => (
          <div key={path.id} className={pathCardStyle} data-path-card>
            <div className={pathHeadStyle}>
              <span>
                {paths.find((port) => port.outputName === path.value)?.label ??
                  `Path ${paths.length + index + 1}`}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setAdded((current) =>
                    current.filter((candidate) => candidate.id !== path.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
            <div className={whenStyle}>
              <span className={goesToStyle}>When</span>
              <span>{output.label}</span>
              <span className={goesToStyle}>is</span>
              <Select
                size="xs"
                placeholder="Choose a value"
                aria-label={`${output.label} value`}
                items={paths.map((port) => ({
                  value: port.outputName,
                  text: port.label,
                }))}
                value={path.value ?? undefined}
                onChange={(value) =>
                  setAdded((current) =>
                    current.map((candidate) =>
                      candidate.id === path.id
                        ? { ...candidate, value }
                        : candidate,
                    ),
                  )
                }
              />
            </div>
          </div>
        ))}
        <div className={pathCardStyle} data-path-card>
          <div className={pathHeadStyle}>
            <span className={goesToStyle}>Default</span>
            <span className={css({ display: "flex", minWidth: "[0]" })}>
              {goesTo("otherwise")}
            </span>
          </div>
        </div>
        <Button
          size="xs"
          variant="subtle"
          iconName="plus"
          onClick={() =>
            setAdded((current) => [
              ...current,
              { id: `added${current.length}`, value: null },
            ])
          }
        >
          Add path
        </Button>
      </div>
    </Section>
  );
};

