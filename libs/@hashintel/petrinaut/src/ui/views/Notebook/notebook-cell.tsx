import { Fragment, useRef, useState } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { getDocumentUri } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../react/hooks/use-petrinaut-mutations";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { useDraftField } from "../../hooks/use-draft-field";
import { CodeEditor } from "../../monaco/code-editor";
import { focusLands } from "../../worksheet/focus-flow";
import { CELL_KIND_ICONS, CELL_KIND_LABELS } from "./cell-kinds";
import { cycleTint } from "./net-cycles";
import {
  arcPlaceId,
  placeName,
  transitionInputPlaceIds,
  transitionOutputPlaceIds,
} from "./notebook-model";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { CodeEditorProps } from "../../monaco/code-editor";
import type { CycleGroup } from "./net-cycles";
import type { InitialPlaceGroup } from "./net-siphons";
import type {
  DependentCount,
  NotebookCell as NotebookCellModel,
} from "./notebook-model";
import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

const cellStyle = cva({
  base: {
    borderBottomWidth: "[1px]",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.s30",
    borderRadius: "sm",
    transition: "[background-color 100ms ease-out, opacity 100ms ease-out]",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "blue.s20" },
      false: {
        _hover: { backgroundColor: "neutral.bg.surface.hover" },
      },
    },
    isDimmed: {
      true: { opacity: "[0.4]" },
      false: {},
    },
  },
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minHeight: "8",
  paddingX: "1",
  cursor: "pointer",
  userSelect: "none",
});

const caretButtonStyle = cva({
  base: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "4",
    height: "6",
    padding: "[0]",
    backgroundColor: "[transparent]",
    borderWidth: "[0]",
    color: "neutral.s80",
    cursor: "pointer",
    transition: "[transform 150ms ease-out]",
    _hover: { color: "neutral.s115" },
  },
  variants: {
    expanded: {
      true: { transform: "rotate(90deg)" },
      false: { transform: "rotate(0deg)" },
    },
  },
});

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const kindStyle = css({
  flexShrink: 0,
  fontSize: "xs",
  fontFamily: "mono",
  fontWeight: "medium",
  color: "purple.s100",
  whiteSpace: "nowrap",
});

const nameStyle = css({
  flexShrink: 0,
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s115",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "[40%]",
});

const nameMarkStyle = css({
  backgroundColor: "yellow.s40",
  color: "[inherit]",
  borderRadius: "xs",
});

const cycleBadgeStyle = cva({
  base: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "[2px]",
    paddingX: "1",
    borderRadius: "sm",
    fontSize: "[10px]",
    fontWeight: "medium",
    fontFamily: "mono",
    borderWidth: "[1px]",
    borderStyle: "solid",
    cursor: "default",
  },
  variants: {
    tint: {
      pink: {
        backgroundColor: "pink.s20",
        borderColor: "pink.s60",
        color: "pink.s115",
      },
      green: {
        backgroundColor: "green.s20",
        borderColor: "green.s60",
        color: "green.s115",
      },
      yellow: {
        backgroundColor: "yellow.s20",
        borderColor: "yellow.s60",
        color: "yellow.s115",
      },
    },
    isHovered: {
      true: { filter: "[brightness(0.94)]" },
      false: {},
    },
  },
});

const initialBadgeStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  paddingX: "1",
  borderRadius: "sm",
  fontSize: "[10px]",
  fontWeight: "medium",
  fontFamily: "mono",
  borderWidth: "[1px]",
  borderStyle: "solid",
  backgroundColor: "blue.s15",
  borderColor: "blue.s50",
  color: "blue.s110",
  cursor: "default",
});

const countStyle = css({
  flexShrink: 0,
  fontSize: "[10px]",
  fontFamily: "mono",
  color: "neutral.s90",
  cursor: "default",
  paddingLeft: "1",
});

const summaryStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "xs",
  color: "neutral.fg.subtle",
  fontFamily: "mono",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingLeft: "7",
  paddingRight: "2",
  paddingBottom: "3",
});

const fieldRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  fontSize: "xs",
});

const fieldLabelStyle = css({
  flexShrink: 0,
  width: "[110px]",
  color: "neutral.fg.subtle",
  fontWeight: "medium",
});

const fieldValueStyle = css({
  color: "neutral.s115",
  fontFamily: "mono",
  minWidth: "[0]",
  overflowWrap: "anywhere",
});

const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.fg.subtle",
  textTransform: "uppercase",
  letterSpacing: "wide",
  marginTop: "1",
});

const arcListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.s115",
});

const mutedStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
});

const CODE_LINE_HEIGHT = 18;

const CellCodeBlock: React.FC<{
  code: string;
  path: string;
  onChange: (code: string) => void;
}> = ({ code, path, onChange }) => {
  const isReadOnly = useIsReadOnly();
  const editorRef = useRef<
    Parameters<NonNullable<CodeEditorProps["onMount"]>>[0] | null
  >(null);
  const lineCount = code.split("\n").length;
  const height = Math.min(Math.max(lineCount, 3), 24) * CODE_LINE_HEIGHT + 16;

  return (
    <CodeEditor
      path={path}
      language="typescript"
      value={code}
      height={height}
      onMount={(editorInstance) => {
        editorRef.current = editorInstance;
      }}
      onChange={(value) => {
        // Only user edits commit: models are shared by URI and reset
        // programmatically around mount and mode switches, and writing those
        // resets back would wipe the code they carry.
        if (value !== undefined && editorRef.current?.hasTextFocus()) {
          onChange(value);
        }
      }}
      options={{
        readOnly: isReadOnly,
        lineNumbers: "on",
        scrollbar: { alwaysConsumeMouseWheel: false },
      }}
    />
  );
};

/** One focusable line inside an expanded cell body, in visual order. */
export type CellBodyPart = {
  id: string;
  /**
   * Focusable cells on this line, left to right. 1 means the whole line is
   * one full-width focus target; more means horizontal arrows walk the
   * line's cells individually (an arc's place, weight and type).
   */
  columns: number;
};

const bodyPart = (id: string, columns = 1): CellBodyPart => ({
  id,
  columns,
});

/**
 * The focusable parts an expanded cell contributes to the list's focus flow,
 * in the order the body renders them, with the cells each line exposes. Must
 * stay in step with the body components below: a declared part with no
 * matching `data-cell-part` element is a stop arrows can never land on, and
 * a declared column with no matching cell falls back to the line's first.
 */
export function cellBodyParts(
  cell: NotebookCellModel,
  net: ActiveNetDefinition,
): CellBodyPart[] {
  switch (cell.kind) {
    case "transition": {
      const { transition } = cell;
      const arcParts = (
        prefix: string,
        targets: (string | null)[],
        columns: number,
      ): CellBodyPart[] =>
        targets.flatMap((target, index) =>
          target === null ? [] : [bodyPart(`${prefix}-${index}`, columns)],
        );
      return [
        bodyPart("name"),
        // Input arcs expose place, weight and type; outputs have no type.
        ...arcParts("in", transition.inputArcs.map(arcPlaceId), 3),
        ...arcParts("out", transition.outputArcs.map(arcPlaceId), 2),
        bodyPart("code-lambda"),
        bodyPart("code-kernel"),
      ];
    }
    case "place": {
      const { place } = cell;
      const hasEquationCell =
        place.dynamicsEnabled && net.differentialEquations.length > 0;
      return [
        bodyPart("name"),
        bodyPart("type"),
        bodyPart("dynamics", hasEquationCell ? 2 : 1),
        ...(place.isPort ? [bodyPart("port")] : []),
        ...(place.visualizerCode?.trim() ? [bodyPart("code-visualizer")] : []),
      ];
    }
    case "type":
      return [
        bodyPart("name"),
        bodyPart("display-color"),
        ...cell.color.elements.map((element) =>
          bodyPart(`field-${element.elementId}`, 2),
        ),
      ];
    case "differentialEquation":
      return [bodyPart("name"), bodyPart("type"), bodyPart("code")];
    case "parameter":
      return [
        bodyPart("name"),
        bodyPart("variable-name"),
        bodyPart("type"),
        bodyPart("default-value"),
      ];
  }
}

/** The stop id a body part contributes to the list's focus flow. */
export const partStopId = (cellId: string, partId: string): string =>
  `${cellId} ${partId}`;

/** What an expanded body needs to enrol its parts in the focus flow. */
export type BodyPartContext = {
  /** Accessors for the part's stop; `column` defaults to the line's first. */
  focusFor: (partId: string, column?: number) => CellRowFocus;
  stopIdFor: (partId: string) => string;
  navigateToCell: (cellId: string) => void;
};

const partLineStyle = css({
  width: "fit",
  paddingX: "1",
  borderRadius: "sm",
});

/** A multi-cell line: a plain layout row whose cells are the focus targets. */
const cellLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const widgetCellStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "0.5",
  borderRadius: "sm",
});

/**
 * Focusable widget surfaces, in engage order. Monaco's own surface varies by
 * version: a textarea in older builds, an EditContext div in newer ones.
 */
const WIDGET_SELECTOR =
  '.native-edit-context, textarea, input, select, [contenteditable="true"], [tabindex="0"]';

/**
 * Enter on a part either activates or engages its widget: one-shot controls
 * (buttons, checkboxes) act immediately, editable ones (inputs, selects,
 * code editors) take focus so every key belongs to them until Escape.
 */
const activateOrEngage = (container: HTMLElement | null) => {
  for (const candidate of container?.querySelectorAll<HTMLElement>(
    `${WIDGET_SELECTOR}, button`,
  ) ?? []) {
    if (
      candidate instanceof HTMLButtonElement ||
      (candidate instanceof HTMLInputElement && candidate.type === "checkbox")
    ) {
      candidate.click();
      return;
    }
    if (focusLands(candidate)) {
      return;
    }
  }
};

/**
 * A part with widgets inside — a code editor, inputs, selects. The widgets
 * are their own keyboard world: Enter on the part engages the first one,
 * every key then belongs to the widget, Tab cycles the part's widgets, and
 * Escape hands focus back to the part — the grid "interaction mode" pattern
 * from the ARIA Authoring Practices. Widgets carry `tabIndex={-1}` so each
 * cell list stays a single roving tab stop.
 *
 * With a `column`, the part is one cell of a multi-cell line rather than a
 * full-width line: horizontal arrows walk the line's cells too, and the
 * focus flow targets the cell by its `data-part-column`.
 */
const WidgetPart: React.FC<{
  stopId: string;
  focus: CellRowFocus;
  column?: number;
  className?: string;
  children: React.ReactNode;
}> = ({ stopId, focus, column, className, children }) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setElement}
      data-cell-part={stopId}
      data-part-column={column}
      role="group"
      tabIndex={focus.tabIndex}
      className={className}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          focus.onFocus();
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          // Keys bubbling out of an engaged widget: Escape disengages, Tab
          // cycles the part's widgets, everything else stays the widget's.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            element?.focus();
          } else if (event.key === "Tab" && element) {
            const widgets = [
              ...element.querySelectorAll<HTMLElement>(WIDGET_SELECTOR),
            ];
            const at = widgets.indexOf(event.target as HTMLElement);
            const next = widgets[at + (event.shiftKey ? -1 : 1)];
            if (at !== -1 && next) {
              event.preventDefault();
              event.stopPropagation();
              next.focus();
            }
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          activateOrEngage(element);
        } else if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          (column !== undefined &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight"))
        ) {
          focus.onNavigate(event);
        }
      }}
    >
      {children}
    </div>
  );
};

/** One cell of a multi-cell body line, as a WidgetPart pinned to a column. */
const WidgetCell: React.FC<{
  parts: BodyPartContext;
  partId: string;
  column: number;
  children: React.ReactNode;
}> = ({ parts, partId, column, children }) => (
  <WidgetPart
    stopId={parts.stopIdFor(partId)}
    focus={parts.focusFor(partId, column)}
    column={column}
    className={widgetCellStyle}
  >
    {children}
  </WidgetPart>
);

const inlineInputStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  backgroundColor: "[transparent]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[transparent]",
  borderRadius: "sm",
  paddingX: "1",
  _hover: { borderColor: "neutral.s40" },
  _focus: {
    borderColor: "blue.s70",
    outline: "[none]",
    backgroundColor: "neutral.s00",
  },
});

/**
 * Inline draft text input for one field of a cell: edits stay local until
 * blur or Enter commits them, Escape reverts to the net's value, and drafts
 * failing `isValid` revert instead of committing.
 */
const PartTextField: React.FC<{
  sourceId: string;
  value: string;
  onCommit: (value: string) => void;
  isValid?: (draft: string) => boolean;
  "aria-label": string;
}> = ({ sourceId, value, onCommit, isValid, "aria-label": ariaLabel }) => {
  const isReadOnly = useIsReadOnly();
  const draft = useDraftField({ sourceId, sourceValue: value });
  // Enter and Escape hand focus back to the part, which blurs the input
  // before their own state settles — the blur must not commit again (Enter)
  // or commit the draft the user just discarded (Escape).
  const skipBlurCommitRef = useRef(false);

  const commit = () => {
    if (isReadOnly || draft.value === value) {
      return;
    }
    if (isValid?.(draft.value) ?? true) {
      onCommit(draft.value);
    } else {
      draft.setValue(value);
    }
  };

  return (
    <input
      tabIndex={-1}
      className={inlineInputStyle}
      style={{
        width: `${Math.min(Math.max(draft.value.length + 2, 6), 48)}ch`,
      }}
      aria-label={ariaLabel}
      readOnly={isReadOnly}
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          skipBlurCommitRef.current = true;
          event.currentTarget.closest<HTMLElement>("[data-cell-part]")?.focus();
        } else if (event.key === "Escape") {
          draft.setValue(value);
          skipBlurCommitRef.current = true;
        }
      }}
    />
  );
};

const inlineSelectStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  backgroundColor: "[transparent]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "sm",
  paddingX: "0.5",
  _focus: { borderColor: "blue.s70", outline: "[none]" },
});

/** Inline enum/reference select for one field of a cell. */
const PartSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
}> = ({ value, onChange, options, "aria-label": ariaLabel }) => {
  const isReadOnly = useIsReadOnly();
  return (
    <select
      tabIndex={-1}
      className={inlineSelectStyle}
      aria-label={ariaLabel}
      disabled={isReadOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

/** A code block as a focus-flow part; edits commit through `onChange`. */
const BodyCodeBlock: React.FC<{
  parts: BodyPartContext;
  partId: string;
  code: string;
  path: string;
  onChange: (code: string) => void;
}> = ({ parts, partId, code, path, onChange }) => (
  <WidgetPart stopId={parts.stopIdFor(partId)} focus={parts.focusFor(partId)}>
    <CellCodeBlock code={code} path={path} onChange={onChange} />
  </WidgetPart>
);

const typeName = (net: ActiveNetDefinition, colorId: string | null): string => {
  if (colorId === null) {
    return "untyped";
  }
  const color = net.types.find(({ id }) => id === colorId);
  return color?.name ?? colorId;
};

const placeSummary = (net: ActiveNetDefinition, place: Place): string => {
  const parts = [typeName(net, place.colorId)];
  if (place.dynamicsEnabled && place.differentialEquationId !== null) {
    const equation = net.differentialEquations.find(
      ({ id }) => id === place.differentialEquationId,
    );
    parts.push(`d/dt: ${equation?.name ?? place.differentialEquationId}`);
  }
  if (place.isPort) {
    parts.push("port");
  }
  return parts.join(" · ");
};

const transitionSummary = (
  net: ActiveNetDefinition,
  transition: Transition,
): string => {
  const inputs = transitionInputPlaceIds(transition).map((id) =>
    placeName(net, id),
  );
  const outputs = transitionOutputPlaceIds(transition).map((id) =>
    placeName(net, id),
  );
  return `${inputs.join(", ") || "∅"} → ${outputs.join(", ") || "∅"}`;
};

const colorSummary = (color: Color): string =>
  color.elements.length === 0
    ? "no fields"
    : color.elements
        .map((element) => `${element.name}: ${element.type}`)
        .join(", ");

const parameterSummary = (parameter: Parameter): string =>
  `${parameter.variableName} = ${parameter.defaultValue} (${parameter.type})`;

const equationSummary = (
  net: ActiveNetDefinition,
  equation: DifferentialEquation,
): string => {
  const places = net.places.filter(
    ({ differentialEquationId }) => differentialEquationId === equation.id,
  );
  return `${typeName(net, equation.colorId)} · ${places.length} place${places.length === 1 ? "" : "s"}`;
};

const FieldRow: React.FC<{
  label: string;
  part?: { stopId: string; focus: CellRowFocus };
  children: React.ReactNode;
}> = ({ label, part, children }) => {
  const content = (
    <>
      <span className={fieldLabelStyle}>{label}</span>
      <span className={fieldValueStyle}>{children}</span>
    </>
  );
  return part === undefined ? (
    <div className={fieldRowStyle}>{content}</div>
  ) : (
    <WidgetPart
      stopId={part.stopId}
      focus={part.focus}
      className={fieldRowStyle}
    >
      {content}
    </WidgetPart>
  );
};

const UNTYPED = "__untyped__";

const PlaceBody: React.FC<{
  net: ActiveNetDefinition;
  place: Place;
  parts: BodyPartContext;
}> = ({ net, place, parts }) => {
  const { updatePlace } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const partFor = (partId: string) => ({
    stopId: parts.stopIdFor(partId),
    focus: parts.focusFor(partId),
  });
  const typeOptions = [
    { value: UNTYPED, label: "untyped" },
    ...net.types.map((color) => ({
      value: color.id,
      label: color.name || color.id,
    })),
  ];
  const equationOptions = net.differentialEquations.map((equation) => ({
    value: equation.id,
    label: equation.name || equation.id,
  }));

  return (
    <>
      <FieldRow label="Name" part={partFor("name")}>
        <PartTextField
          sourceId={place.id}
          value={place.name}
          aria-label="Place name"
          onCommit={(name) =>
            updatePlace({ placeId: place.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Type" part={partFor("type")}>
        <PartSelect
          aria-label="Token type"
          value={place.colorId ?? UNTYPED}
          options={typeOptions}
          onChange={(value) =>
            updatePlace({
              placeId: place.id,
              update: { colorId: value === UNTYPED ? null : value },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Dynamics">
        <span className={cellLineStyle}>
          <WidgetCell parts={parts} partId="dynamics" column={0}>
            <input
              type="checkbox"
              tabIndex={-1}
              aria-label="Dynamics enabled"
              disabled={isReadOnly}
              checked={place.dynamicsEnabled}
              onChange={(event) =>
                updatePlace({
                  placeId: place.id,
                  update: { dynamicsEnabled: event.target.checked },
                })
              }
            />
          </WidgetCell>
          {place.dynamicsEnabled ? (
            equationOptions.length > 0 ? (
              <WidgetCell parts={parts} partId="dynamics" column={1}>
                <PartSelect
                  aria-label="Differential equation"
                  value={place.differentialEquationId ?? ""}
                  options={[
                    { value: "", label: "no equation" },
                    ...equationOptions,
                  ]}
                  onChange={(value) =>
                    updatePlace({
                      placeId: place.id,
                      update: {
                        differentialEquationId: value === "" ? null : value,
                      },
                    })
                  }
                />
              </WidgetCell>
            ) : (
              <span className={mutedStyle}>no equations in the net</span>
            )
          ) : (
            <span className={mutedStyle}>disabled</span>
          )}
        </span>
      </FieldRow>
      {place.isPort ? (
        <FieldRow label="Port" part={partFor("port")}>
          exposed as component port
        </FieldRow>
      ) : null}
      {place.visualizerCode?.trim() ? (
        <>
          <span className={sectionLabelStyle}>Visualizer</span>
          <BodyCodeBlock
            parts={parts}
            partId="code-visualizer"
            code={place.visualizerCode}
            path={`inmemory://sdcpn/places/${place.id}/visualizer.tsx`}
            onChange={(code) =>
              updatePlace({
                placeId: place.id,
                update: { visualizerCode: code },
              })
            }
          />
        </>
      ) : null}
    </>
  );
};

const arcJumpStyle = css({
  cursor: "pointer",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  _hover: { textDecoration: "underline" },
});

const INPUT_ARC_TYPES: { value: string; label: string }[] = [
  { value: "standard", label: "standard" },
  { value: "read", label: "read" },
  { value: "inhibitor", label: "inhibitor" },
];

const ArcLine: React.FC<{
  net: ActiveNetDefinition;
  transitionId: string;
  direction: "input" | "output";
  placeId: string;
  weight: number;
  arcType: string | null;
  index: number;
  partId: string;
  parts: BodyPartContext;
}> = ({
  net,
  transitionId,
  direction,
  placeId,
  weight,
  arcType,
  index,
  partId,
  parts,
}) => {
  const { updateArcWeight, updateArcType } = usePetrinautMutations();

  return (
    <div className={cx(partLineStyle, cellLineStyle)}>
      <span>{index + 1}.</span>
      <WidgetCell parts={parts} partId={partId} column={0}>
        <button
          type="button"
          tabIndex={-1}
          className={arcJumpStyle}
          title="Jump to this place"
          onClick={() => parts.navigateToCell(placeId)}
        >
          {placeName(net, placeId)}
        </button>
      </WidgetCell>
      <span>×</span>
      <WidgetCell parts={parts} partId={partId} column={1}>
        <PartTextField
          sourceId={`${transitionId} ${partId}`}
          value={String(weight)}
          aria-label="Arc weight"
          isValid={(draft) =>
            Number(draft) > 0 && Number.isFinite(Number(draft))
          }
          onCommit={(draft) =>
            updateArcWeight({
              transitionId,
              arcDirection: direction,
              placeId,
              weight: Number(draft),
            })
          }
        />
      </WidgetCell>
      {arcType !== null && (
        <WidgetCell parts={parts} partId={partId} column={2}>
          <PartSelect
            aria-label="Arc type"
            value={arcType}
            options={INPUT_ARC_TYPES}
            onChange={(value) =>
              updateArcType({
                transitionId,
                placeId,
                type: value as "standard" | "read" | "inhibitor",
              })
            }
          />
        </WidgetCell>
      )}
    </div>
  );
};

const ArcLines: React.FC<{
  net: ActiveNetDefinition;
  transitionId: string;
  direction: "input" | "output";
  arcs: { placeId: string | null; weight: number; arcType: string | null }[];
  partPrefix: string;
  parts: BodyPartContext;
}> = ({ net, transitionId, direction, arcs, partPrefix, parts }) =>
  arcs.length > 0 ? (
    <div className={arcListStyle}>
      {arcs.map(({ placeId, weight, arcType }, index) =>
        placeId === null ? (
          <span key={`port-${String(index)}`}>
            {index + 1}. component port ×{weight}
          </span>
        ) : (
          <ArcLine
            key={`${placeId} ${String(index)}`}
            net={net}
            transitionId={transitionId}
            direction={direction}
            placeId={placeId}
            weight={weight}
            arcType={arcType}
            index={index}
            partId={`${partPrefix}-${index}`}
            parts={parts}
          />
        ),
      )}
    </div>
  ) : (
    <span className={mutedStyle}>None</span>
  );

const TransitionBody: React.FC<{
  net: ActiveNetDefinition;
  transition: Transition;
  parts: BodyPartContext;
}> = ({ net, transition, parts }) => {
  const { updateTransition } = usePetrinautMutations();
  return (
    <>
      <FieldRow
        label="Name"
        part={{
          stopId: parts.stopIdFor("name"),
          focus: parts.focusFor("name"),
        }}
      >
        <PartTextField
          sourceId={transition.id}
          value={transition.name}
          aria-label="Transition name"
          onCommit={(name) =>
            updateTransition({ transitionId: transition.id, update: { name } })
          }
        />
      </FieldRow>

      <span className={sectionLabelStyle}>Inputs</span>
      <ArcLines
        net={net}
        transitionId={transition.id}
        direction="input"
        arcs={transition.inputArcs.map((arc) => ({
          placeId: arcPlaceId(arc),
          weight: arc.weight,
          arcType: arc.type,
        }))}
        partPrefix="in"
        parts={parts}
      />

      <span className={sectionLabelStyle}>Outputs</span>
      <ArcLines
        net={net}
        transitionId={transition.id}
        direction="output"
        arcs={transition.outputArcs.map((arc) => ({
          placeId: arcPlaceId(arc),
          weight: arc.weight,
          arcType: null,
        }))}
        partPrefix="out"
        parts={parts}
      />

      <span className={sectionLabelStyle}>
        Firing time —{" "}
        {transition.lambdaType === "predicate" ? "predicate" : "stochastic"}
      </span>
      <BodyCodeBlock
        parts={parts}
        partId="code-lambda"
        code={transition.lambdaCode}
        path={getDocumentUri("transition-lambda", transition.id)}
        onChange={(code) =>
          updateTransition({
            transitionId: transition.id,
            update: { lambdaCode: code },
          })
        }
      />

      <span className={sectionLabelStyle}>Transition kernel</span>
      <BodyCodeBlock
        parts={parts}
        partId="code-kernel"
        code={transition.transitionKernelCode}
        path={getDocumentUri("transition-kernel", transition.id)}
        onChange={(code) =>
          updateTransition({
            transitionId: transition.id,
            update: { transitionKernelCode: code },
          })
        }
      />
    </>
  );
};

const TYPE_ELEMENT_TYPES: { value: string; label: string }[] = [
  { value: "real", label: "real" },
  { value: "integer", label: "integer" },
  { value: "boolean", label: "boolean" },
];

const TypeBody: React.FC<{ color: Color; parts: BodyPartContext }> = ({
  color,
  parts,
}) => {
  const { updateType, updateTypeElement } = usePetrinautMutations();
  const partFor = (partId: string) => ({
    stopId: parts.stopIdFor(partId),
    focus: parts.focusFor(partId),
  });

  return (
    <>
      <FieldRow label="Name" part={partFor("name")}>
        <PartTextField
          sourceId={color.id}
          value={color.name}
          aria-label="Type name"
          onCommit={(name) =>
            updateType({ typeId: color.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Display color" part={partFor("display-color")}>
        <PartTextField
          sourceId={color.id}
          value={color.displayColor}
          aria-label="Display color"
          onCommit={(displayColor) =>
            updateType({ typeId: color.id, update: { displayColor } })
          }
        />
      </FieldRow>
      <span className={sectionLabelStyle}>Fields</span>
      {color.elements.length > 0 ? (
        <div className={arcListStyle}>
          {color.elements.map((element) => (
            <div
              key={element.elementId}
              className={cx(partLineStyle, cellLineStyle)}
            >
              <WidgetCell
                parts={parts}
                partId={`field-${element.elementId}`}
                column={0}
              >
                <PartTextField
                  sourceId={element.elementId}
                  value={element.name}
                  aria-label="Field name"
                  onCommit={(name) =>
                    updateTypeElement({
                      typeId: color.id,
                      elementId: element.elementId,
                      update: { name },
                    })
                  }
                />
              </WidgetCell>
              <span>:</span>
              <WidgetCell
                parts={parts}
                partId={`field-${element.elementId}`}
                column={1}
              >
                <PartSelect
                  aria-label="Field type"
                  value={element.type}
                  options={TYPE_ELEMENT_TYPES}
                  onChange={(value) =>
                    updateTypeElement({
                      typeId: color.id,
                      elementId: element.elementId,
                      update: { type: value as "real" | "integer" | "boolean" },
                    })
                  }
                />
              </WidgetCell>
            </div>
          ))}
        </div>
      ) : (
        <span className={mutedStyle}>No fields</span>
      )}
    </>
  );
};

const PARAMETER_TYPES: { value: string; label: string }[] = [
  { value: "real", label: "real" },
  { value: "integer", label: "integer" },
  { value: "boolean", label: "boolean" },
];

const ParameterBody: React.FC<{
  parameter: Parameter;
  parts: BodyPartContext;
}> = ({ parameter, parts }) => {
  const { updateParameter } = usePetrinautMutations();
  const fieldPart = (partId: string) => ({
    stopId: parts.stopIdFor(partId),
    focus: parts.focusFor(partId),
  });
  return (
    <>
      <FieldRow label="Name" part={fieldPart("name")}>
        <PartTextField
          sourceId={parameter.id}
          value={parameter.name}
          aria-label="Parameter name"
          onCommit={(name) =>
            updateParameter({ parameterId: parameter.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Variable name" part={fieldPart("variable-name")}>
        <PartTextField
          sourceId={parameter.id}
          value={parameter.variableName}
          aria-label="Variable name"
          isValid={(draft) => /^[A-Za-z_$][\w$]*$/.test(draft)}
          onCommit={(variableName) =>
            updateParameter({
              parameterId: parameter.id,
              update: { variableName },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Type" part={fieldPart("type")}>
        <PartSelect
          aria-label="Parameter type"
          value={parameter.type}
          options={PARAMETER_TYPES}
          onChange={(value) =>
            updateParameter({
              parameterId: parameter.id,
              update: { type: value as "real" | "integer" | "boolean" },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Default value" part={fieldPart("default-value")}>
        <PartTextField
          sourceId={parameter.id}
          value={parameter.defaultValue}
          aria-label="Default value"
          onCommit={(defaultValue) =>
            updateParameter({
              parameterId: parameter.id,
              update: { defaultValue },
            })
          }
        />
      </FieldRow>
    </>
  );
};

const EquationBody: React.FC<{
  net: ActiveNetDefinition;
  equation: DifferentialEquation;
  parts: BodyPartContext;
}> = ({ net, equation, parts }) => {
  const { updateDifferentialEquation } = usePetrinautMutations();
  const partFor = (partId: string) => ({
    stopId: parts.stopIdFor(partId),
    focus: parts.focusFor(partId),
  });
  return (
    <>
      <FieldRow label="Name" part={partFor("name")}>
        <PartTextField
          sourceId={equation.id}
          value={equation.name}
          aria-label="Equation name"
          onCommit={(name) =>
            updateDifferentialEquation({
              equationId: equation.id,
              update: { name },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Applies to type" part={partFor("type")}>
        <PartSelect
          aria-label="Applies to type"
          value={equation.colorId ?? UNTYPED}
          options={[
            { value: UNTYPED, label: "untyped" },
            ...net.types.map((color) => ({
              value: color.id,
              label: color.name || color.id,
            })),
          ]}
          onChange={(value) =>
            updateDifferentialEquation({
              equationId: equation.id,
              update: { colorId: value === UNTYPED ? null : value },
            })
          }
        />
      </FieldRow>
      <span className={sectionLabelStyle}>Equation</span>
      <BodyCodeBlock
        parts={parts}
        partId="code"
        code={equation.code}
        path={getDocumentUri("differential-equation", equation.id)}
        onChange={(code) =>
          updateDifferentialEquation({
            equationId: equation.id,
            update: { code },
          })
        }
      />
    </>
  );
};

/** Renders `name` with the fuzzy-matched characters marked. */
export const HighlightedName: React.FC<{
  name: string;
  matchIndices: number[] | null;
}> = ({ name, matchIndices }) => {
  if (matchIndices === null || matchIndices.length === 0) {
    return name;
  }
  const matched = new Set(matchIndices);

  const segments: { start: number; text: string; isMatch: boolean }[] = [];
  let runStart = 0;
  for (let index = 1; index <= name.length; index++) {
    if (index === name.length || matched.has(index) !== matched.has(runStart)) {
      segments.push({
        start: runStart,
        text: name.slice(runStart, index),
        isMatch: matched.has(runStart),
      });
      runStart = index;
    }
  }

  return segments.map((segment) =>
    segment.isMatch ? (
      <mark key={segment.start} className={nameMarkStyle}>
        {segment.text}
      </mark>
    ) : (
      <Fragment key={segment.start}>{segment.text}</Fragment>
    ),
  );
};

const CELL_ICON_SIZE = 12;

const cellPresentation = (
  net: ActiveNetDefinition,
  cell: NotebookCellModel,
  parts: BodyPartContext,
): {
  iconColor: string | undefined;
  name: string;
  summary: string;
  body: React.ReactNode;
} => {
  switch (cell.kind) {
    case "place": {
      const color = net.types.find(({ id }) => id === cell.place.colorId);
      return {
        iconColor: color?.displayColor,
        name: cell.place.name || cell.id,
        summary: placeSummary(net, cell.place),
        body: <PlaceBody net={net} place={cell.place} parts={parts} />,
      };
    }
    case "transition":
      return {
        iconColor: undefined,
        name: cell.transition.name || cell.id,
        summary: transitionSummary(net, cell.transition),
        body: (
          <TransitionBody
            net={net}
            transition={cell.transition}
            parts={parts}
          />
        ),
      };
    case "type":
      return {
        iconColor: cell.color.displayColor,
        name: cell.color.name || cell.id,
        summary: colorSummary(cell.color),
        body: <TypeBody color={cell.color} parts={parts} />,
      };
    case "differentialEquation":
      return {
        iconColor: undefined,
        name: cell.equation.name || cell.id,
        summary: equationSummary(net, cell.equation),
        body: <EquationBody net={net} equation={cell.equation} parts={parts} />,
      };
    case "parameter":
      return {
        iconColor: undefined,
        name: cell.parameter.name || cell.id,
        summary: parameterSummary(cell.parameter),
        body: <ParameterBody parameter={cell.parameter} parts={parts} />,
      };
  }
};

export interface NotebookCellProps {
  net: ActiveNetDefinition;
  cell: NotebookCellModel;
  isSelected: boolean;
  isExpanded: boolean;
  /** Row is faded because a search is active and this cell doesn't match. */
  isDimmed: boolean;
  /** Matched character indices in the name while searching, or null. */
  nameMatchIndices: number[] | null;
  /** How much depends on this cell, shown at the end of the row. */
  dependentCount: DependentCount | undefined;
  /** The cycle this cell belongs to, if any. */
  cycle: CycleGroup | undefined;
  /**
   * Set when this place has to hold tokens in the initial state, because
   * nothing in the net can produce into its group.
   */
  initialGroup: InitialPlaceGroup | undefined;
  /** Whether that cycle is currently hovered anywhere in the view. */
  isCycleHovered: boolean;
  onHoverCycle: (cycleKey: string | null) => void;
  onSelect: () => void;
  onSetExpanded: (expanded: boolean) => void;
  /** The row's slice of the list's worksheet focus flow. */
  rowFocus: CellRowFocus;
  /** Enrols the expanded body's parts in the same flow. */
  bodyParts: BodyPartContext;
  onFocusSearch: () => void;
}

export interface CellRowFocus {
  /** 0 for the list's one tabbable row, -1 for the rest (roving tab stop). */
  tabIndex: 0 | -1;
  /** Reports row focus, keeping selection and the roving stop in step. */
  onFocus: () => void;
  /** Vertical arrow navigation — the keys the row doesn't own itself. */
  onNavigate: React.KeyboardEventHandler;
}

export const NotebookCell: React.FC<NotebookCellProps> = ({
  net,
  cell,
  isSelected,
  isExpanded,
  isDimmed,
  nameMatchIndices,
  dependentCount,
  cycle,
  initialGroup,
  isCycleHovered,
  onHoverCycle,
  onSelect,
  onSetExpanded,
  rowFocus,
  bodyParts,
  onFocusSearch,
}) => {
  const { iconColor, name, summary, body } = cellPresentation(
    net,
    cell,
    bodyParts,
  );
  const KindIcon = CELL_KIND_ICONS[cell.kind];
  const kindLabel = CELL_KIND_LABELS[cell.kind];

  return (
    <div data-cell-id={cell.id} className={cellStyle({ isSelected, isDimmed })}>
      <div
        data-cell-row={cell.id}
        className={rowStyle}
        role="button"
        tabIndex={rowFocus.tabIndex}
        onClick={onSelect}
        onFocus={(event) => {
          // Only the row itself: focus events bubble from the caret button.
          if (event.target === event.currentTarget) {
            rowFocus.onFocus();
          }
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            onSelect();
          } else if (event.key === "ArrowRight") {
            // The row owns the horizontal arrows for expand/collapse, so it
            // never emits horizontal moves into the worksheet flow.
            event.preventDefault();
            onSetExpanded(true);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSetExpanded(false);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            rowFocus.onNavigate(event);
          } else if (event.key === "/") {
            event.preventDefault();
            onFocusSearch();
          }
        }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse cell" : "Expand cell"}
          aria-expanded={isExpanded}
          tabIndex={-1}
          className={caretButtonStyle({ expanded: isExpanded })}
          onClick={(event) => {
            event.stopPropagation();
            onSetExpanded(!isExpanded);
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path d="M2 0 L7 4 L2 8 Z" fill="currentColor" />
          </svg>
        </button>
        <span
          className={iconStyle}
          style={iconColor === undefined ? undefined : { color: iconColor }}
        >
          <KindIcon size={CELL_ICON_SIZE} />
        </span>
        <span className={kindStyle}>{kindLabel}</span>
        <span className={nameStyle}>
          <HighlightedName name={name} matchIndices={nameMatchIndices} />
        </span>
        {initialGroup !== undefined && (
          <span
            className={initialBadgeStyle}
            title={
              initialGroup.placeIds.length === 1
                ? "Must hold tokens in the initial state: nothing in the net produces into it"
                : `Must hold tokens in the initial state: this pool of ${initialGroup.placeIds.length} places only circulates what it starts with`
            }
          >
            initial
          </span>
        )}
        {cycle !== undefined && (
          <span
            className={cycleBadgeStyle({
              tint: cycleTint(cycle),
              isHovered: isCycleHovered,
            })}
            title={`In cycle ${cycle.label} with ${cycle.memberIds.length - 1} other node${cycle.memberIds.length === 2 ? "" : "s"}`}
            onMouseEnter={() => onHoverCycle(cycle.key)}
            onMouseLeave={() => onHoverCycle(null)}
          >
            ↻{cycle.label}
          </span>
        )}
        <span className={summaryStyle}>{summary}</span>
        {dependentCount !== undefined && dependentCount.transitive > 0 && (
          <span
            className={countStyle}
            title={`${dependentCount.direct} direct dependent${dependentCount.direct === 1 ? "" : "s"}, ${dependentCount.transitive} in total`}
          >
            {dependentCount.direct} → {dependentCount.transitive}
          </span>
        )}
      </div>
      {isExpanded && <div className={bodyStyle}>{body}</div>}
    </div>
  );
};
