/**
 * Output attribution in the run view (research 12 Nov, `output-attribution-2026-11-12.md` (c)): every produced item
 * says which step made it. ?attrib=a|b from the URL only; no param changes nothing.
 * a. Logs counts lead with the step's hue tile, its name on hover; a list of several steps' outputs stacks one section
 *    per step ("Fetch certificate · 18 certificates").
 * b. Logs counts are step names ("Fetch certificate 18"), cut with +N to keep one line; a list of several steps'
 *    outputs has one tab per step.
 * Both: the step panel's heading names the output ("Certificates · 18"), and Featured outputs rows read
 * "Fetch certificate › File entity".
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import { findStep } from "./document";
import { useEditor } from "./editor-context";
import { useLocation } from "./router";
import { treeTileColor } from "./status-colors";

export type AttribTake = "a" | "b" | null;

/**
 * Picked 13 Nov (inbox output-attribution: yes, a; run outputs a; For each outputs a): take a is the default in every
 * place but Logs. `?attrib=old` keeps today's lists grouped by type; `?attrib=b` shows take b.
 */
export const useAttrib = (): AttribTake => {
  const value = useLocation().query.get("attrib")?.toLowerCase();
  return value === "b" ? "b" : value === "old" ? null : "a";
};

/** Logs keep today's counts (output-attribution-logs: today); `?attrib=a|b` still shows a take there. */
export const useAttribInLogs = (): AttribTake => {
  const value = useLocation().query.get("attrib")?.toLowerCase();
  return value === "a" || value === "b" ? value : null;
};

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
