/**
 * Output attribution in the run view (research 12 Nov, `output-attribution-2026-11-12.md` (c)): every produced item
 * says which step made it. Take a, picked 13 Nov (output-attribution: yes, a; run outputs a; For each outputs a; Logs
 * today): a list of several steps' outputs stacks one section per step ("Fetch certificate · 18 certificates"), and
 * Featured outputs rows read "Fetch certificate › File entity". Logs keep today's counts.
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import { findStep } from "./document";
import { useEditor } from "./editor-context";
import { treeTileColor } from "./status-colors";

export type AttribTake = "a" | "b" | null;

/** The Used in R2 tile at rest: 16 px, the step's group hue, a 10 px icon. */
const tileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[16px]",
  height: "[16px]",
  borderRadius: "[4px]",
  "& svg": { width: "[10px !important]", height: "[10px !important]" },
});

export const StepTile = ({ stepId }: { stepId: string }) => {
  const { document } = useEditor();
  const step = findStep(document, stepId)?.step;
  const icon = !step
    ? "cube"
    : step.kind === "for-each"
      ? "rotate"
      : (getCatalogEntry(step.actionDefinitionId)?.icon ?? "cube");
  return (
    <span className={tileStyle} style={treeTileColor(icon)} data-step-tile={stepId}>
      <Icon name={icon} size="sm" />
    </span>
  );
};
