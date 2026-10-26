/**
 * A step's Outputs, as the 26 Oct sync asked (T26):
 *
 * - Each output is data with its kind as a small badge under its name (Ciarán: "entities", "integer").
 * - The steps that use it hang under it as a short vertical list, one per line, not one crowded row (a hierarchy,
 *   preferred over the flat chip row of 16–21 Oct).
 * - Three show; "+N more" lists the next ten on hover and shows all on click (Dei: there might be 50 or 100).
 * - With or without node icons on the chips: both versions, to choose between (`ui.outputIcons`; Aakarsh, 26 Oct).
 */
import { useState } from "react";

import { Chip, type IconName, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type EditorDocument, findStep, stepLabel, usersOf } from "./document";
import { useEditor } from "./editor-context";
import { PropertyRow, SourceChip } from "./ui";

import type { StepInputSource } from "./engine";

const shownUsers = 3;
const hoverUsers = 10;

const labelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
  minWidth: "[0]",
});

/** One user per line, joined by a thin rail on the left so they read as children of the output. */
const treeStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
  minWidth: "[0]",
  paddingLeft: "2",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
});

const emptyStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

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
  return (
    <div className={treeStyle}>
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
      {rest.length > 0 && !all ? (
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
          <button type="button" className={moreStyle} onClick={() => setAll(true)}>
            +{rest.length} more
          </button>
        </Tooltip>
      ) : null}
      {all && rest.length > 0 ? (
        <button type="button" className={moreStyle} onClick={() => setAll(false)}>
          Show less
        </button>
      ) : null}
    </div>
  );
};

/** The kind under an output's name: "List of Shipment", "Number". Unknown until the step's input is set. */
const KindBadge = ({ kind }: { kind: string | null }) => (
  <Chip size="xs" variant="soft">
    {kind ?? "Any"}
  </Chip>
);

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
            <span className={labelStackStyle}>
              <span>{output.label}</span>
              <KindBadge kind={kind} />
            </span>
          }
          hover={kind ? undefined : "Kind is known when it runs"}
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
