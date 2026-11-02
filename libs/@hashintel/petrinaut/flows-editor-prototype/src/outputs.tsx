/**
 * A step's Outputs, as the 2 Nov sync settled (J2.51, J4.4):
 *
 * - A type icon left of each output's name (checklist for a choice, T for text, person for a reviewer).
 * - What depends on it, by name, as plain text: "Used in Alert to the team", or "Not used yet".
 * - The dependents as chips only while the row is hovered; a chip selects that step.
 * - Three names show; "+N more" lists the next ten on hover and shows all on click (Dei: there might be 50 or 100).
 */
import { useState } from "react";

import { Chip, Icon, type IconName, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type EditorDocument, findStep, stepLabel, usersOf } from "./document";
import { useEditor } from "./editor-context";
import { PropertyRow, SourceChip } from "./ui";

import type { StepInputSource } from "./engine";

const shownUsers = 3;
const hoverUsers = 10;

/** The dependents line: plain text until the row is hovered, then the chips. */
const usedStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  fontSize: "[13px]", // token-guard: allow Figma panel values beside labels are 13 px (J2.51)
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
});

const namesStyle = css({ "[data-row]:hover &": { display: "none" } });

const chipsStyle = css({
  display: "none",
  "[data-row]:hover &": { display: "contents" },
});

const emptyStyle = css({
  fontSize: "[13px]", // token-guard: allow Figma panel values beside labels are 13 px (J2.51)
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
});

const moreStyle = css({
  padding: "[0]",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "xs",
  color: "neutral.fg.muted",
  _hover: { color: "neutral.fg.heading", textDecoration: "underline" },
});

const nameOf = (document: EditorDocument, id: string) => {
  const step = findStep(document, id)?.step;
  return step ? stepLabel(step) : id;
};

const UsedByTree = ({
  match,
  iconOf,
}: {
  match: (source: StepInputSource) => boolean;
  iconOf: (id: string) => IconName;
}) => {
  const { document, ui, setUi } = useEditor();
  const [all, setAll] = useState(false);
  const users = usersOf(document, match);
  if (users.length === 0) {
    return <span className={emptyStyle}>Not used yet</span>;
  }
  const withIcons = ui.outputIcons !== false;
  const shown = all ? users : users.slice(0, shownUsers);
  const rest = users.slice(shownUsers);
  const select = (id: string) =>
    setUi((current) => ({ ...current, selectedId: id, openField: null }));
  const more =
    rest.length > 0 && !all ? (
      <Tooltip
        content={
          <span className={css({ display: "flex", flexDirection: "column" })}>
            {rest.slice(0, hoverUsers).map((id) => (
              <span key={id}>{nameOf(document, id)}</span>
            ))}
            {rest.length > hoverUsers ? (
              <span>and {rest.length - hoverUsers} more</span>
            ) : null}
          </span>
        }
      >
        <button
          type="button"
          className={moreStyle}
          onClick={() => setAll(true)}
        >
          +{rest.length} more
        </button>
      </Tooltip>
    ) : null;
  return (
    <div className={usedStyle}>
      <span className={namesStyle}>
        Used in {shown.map((id) => nameOf(document, id)).join(", ")}
      </span>
      <span className={chipsStyle}>
        {shown.map((id) =>
          withIcons ? (
            <SourceChip key={id} icon={iconOf(id)} onClick={() => select(id)}>
              {nameOf(document, id)}
            </SourceChip>
          ) : (
            <Chip key={id} size="md" onClick={() => select(id)}>
              {nameOf(document, id)}
            </Chip>
          ),
        )}
      </span>
      {more}
      {all && rest.length > 0 ? (
        <button
          type="button"
          className={moreStyle}
          onClick={() => setAll(false)}
        >
          Show less
        </button>
      ) : null}
    </div>
  );
};

/** An output's type as the icon left of its name (2 Nov): its kind decides it. */
const kindIcon = (kind: string | null): IconName => {
  const name = (kind ?? "").replace(/^List of /, "");
  const list = kind?.startsWith("List of ") ?? false;
  if (/entity/i.test(name)) {
    return list ? "cubes" : "cube";
  }
  if (/date|time/i.test(name)) {
    return "calendar";
  }
  if (/number|integer/i.test(name)) {
    return "oneHundred";
  }
  if (/boolean|choice|decision/i.test(name)) {
    return "list";
  }
  if (/person|user|actor/i.test(name)) {
    return "user";
  }
  if (/file/i.test(name)) {
    return "file";
  }
  return list ? "list" : "text";
};

export const OutputRows = ({
  stepId,
  outputs,
  kindOf,
  iconOf,
}: {
  stepId: string;
  outputs: { name: string; label: string }[];
  /** The output's kind as a label, or `null` when it is known only when the flow runs. */
  kindOf: (outputName: string) => string | null;
  iconOf: (id: string) => IconName;
}) => (
  <>
    {outputs.map((output) => {
      const kind = kindOf(output.name);
      return (
        <PropertyRow
          key={output.name}
          label={
            <span
              className={css({
                display: "inline-flex",
                alignItems: "center",
                gap: "1",
              })}
            >
              <Icon name={kindIcon(kind)} size="sm" />
              {output.label}
            </span>
          }
          hover={kind ?? "Kind is known when it runs"}
        >
          <UsedByTree
            iconOf={iconOf}
            match={(source) =>
              source.kind === "step-output" &&
              source.stepId === stepId &&
              source.outputName === output.name
            }
          />
        </PropertyRow>
      );
    })}
  </>
);
