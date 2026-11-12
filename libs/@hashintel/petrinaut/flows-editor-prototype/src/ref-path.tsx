/**
 * A value that comes from another step (t2, decided 12 Nov, inbox conv-source-field-text): the source step's hue tile,
 * then `Step › Output`, the same as a Used in row. In a narrow field the step name is cut first; the output never is.
 * Chips in text and the To list carry the step icon in grey, then the same `Step › Output`. In a run the value comes
 * first, with the tile and the path under it, muted. Type icons stay out (parked 11 Nov).
 */
import { Icon, type IconName } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry, humanize, stepOutputs } from "./catalog";
import {
  type EditorDocument,
  findStep,
  itemPropertyOf,
  stepLabel,
} from "./document";
import { useEditor } from "./editor-context";
import { treeTileColor } from "./status-colors";

import type { StepInputSource } from "./engine";

export type RefLook = { icon: IconName; step: string; output: string };

/** The step a reference comes from (its icon and name) and the output it reads, by their real names. */
export const refLook = (
  document: EditorDocument,
  source: StepInputSource,
  stepId?: string,
): RefLook | null => {
  if (source.kind === "flow-input") {
    const input = document.inputs.find(
      (candidate) => candidate.name === source.inputName,
    );
    return {
      icon: "play",
      // Start's name, as the Steps list and Start's card show it (J2.13a: "Flow inputs › Entity type").
      step: document.startDescription || "Flow inputs",
      output: input?.label ?? humanize(source.inputName),
    };
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    if (!step) {
      return { icon: "cube", step: source.stepId, output: humanize(source.outputName) };
    }
    const entry =
      step.kind === "action" ? getCatalogEntry(step.actionDefinitionId) : undefined;
    const output = (step.kind === "action" ? stepOutputs(step) : []).find(
      (candidate) => candidate.name === source.outputName,
    );
    return {
      icon: (step.kind === "for-each" ? "rotate" : (entry?.icon ?? "cube")) as IconName,
      step: stepLabel(step),
      output: output?.label ?? humanize(source.outputName),
    };
  }
  if (source.kind === "item") {
    const parentId = stepId ? findStep(document, stepId)?.parentId : undefined;
    const loop = parentId ? findStep(document, parentId)?.step : undefined;
    const property = itemPropertyOf(source);
    const name =
      loop?.kind === "for-each" && loop.description.startsWith("For each ")
        ? loop.description.slice("For each ".length)
        : "item";
    return {
      icon: "rotate",
      step: loop ? stepLabel(loop) : "For each",
      output: property ? property.title : name,
    };
  }
  return null;
};

/** The whole path as text, for hovers and labels. */
export const refText = (look: RefLook) => `${look.step} › ${look.output}`;

const tileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[20px]",
  height: "[20px]",
  borderRadius: "[4px]",
  "& svg": { width: "[12px !important]", height: "[12px !important]" },
});

const pathStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  whiteSpace: "nowrap",
  "& [data-ref-step]": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: "[24px]",
    flex: "[0 1 auto]",
  },
  "& [data-ref-sep]": {
    color: "neutral.fg.subtle",
    paddingX: "1.5",
    flexShrink: 0,
  },
  "& [data-ref-output]": { flexShrink: 0 },
  "&[data-muted]": { color: "neutral.fg.muted" },
});

const textStyle = css({ display: "flex", alignItems: "center", minWidth: "[0]" });

/** The tile and `Step › Output`: inside a field (heading colour) or under a run's value (muted). */
export const RefPath = ({
  look,
  muted = false,
}: {
  look: RefLook;
  muted?: boolean;
}) => (
  <span className={pathStyle} data-muted={muted || undefined}>
    <span className={tileStyle} style={treeTileColor(look.icon)} aria-hidden>
      <Icon name={look.icon} size="sm" />
    </span>
    <span className={textStyle}>
      <span data-ref-step>{look.step}</span>
      <span data-ref-sep>›</span>
      <span data-ref-output>{look.output}</span>
    </span>
  </span>
);

const chipTextStyle = css({
  display: "inline-flex",
  alignItems: "center",
  maxWidth: "[100%]",
  minWidth: "[0]",
  verticalAlign: "top",
  "& [data-ref-step]": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: "[24px]",
    flex: "[0 1 auto]",
  },
  "& [data-ref-sep]": { color: "neutral.fg.subtle", paddingX: "1", flexShrink: 0 },
  "& [data-ref-output]": { flexShrink: 0 },
});

/** A chip's text: `Step › Output`, the step name cut first. The chip carries the step icon in grey. */
export const RefChipText = ({ look }: { look: RefLook }) => (
  <span className={chipTextStyle}>
    <span data-ref-step>{look.step}</span>
    <span data-ref-sep>›</span>
    <span data-ref-output>{look.output}</span>
  </span>
);

const runValueStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
  textStyle: "sm",
  "& > [data-value]": { color: "neutral.fg.body", overflowWrap: "anywhere" },
});

/** In a run: the value first, then the tile and `Step › Output` under it, muted. */
export const RunRefValue = ({
  value,
  source,
  stepId,
}: {
  value: React.ReactNode;
  source: StepInputSource;
  stepId: string;
}) => {
  const { document } = useEditor();
  const look = refLook(document, source, stepId);
  return (
    <span className={runValueStyle}>
      <span data-value>{value}</span>
      {look ? <RefPath look={look} muted /> : null}
    </span>
  );
};
