/**
 * The Dynamics table of a place: one row per composed equation — a gutter,
 * the equation's name, how many tokens it couples — in the editor's
 * spreadsheet grammar, in the order the derivatives are applied. Rows
 * reorder by dragging the gutter or with Alt and an arrow key; Enter or a
 * second click on a name opens that equation; the gutter's menu or Delete
 * removes a row; a quiet trailing line adds one of the type's remaining
 * equations.
 */

import { useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { FormSpreadsheet } from "../../../../../../../components/spreadsheet-kit/form-spreadsheet";
import {
  cellStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  labelHeaderStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  selectedRowCellStyle,
} from "../../../../../../../components/spreadsheet-kit/form-table";
import { GutterCell } from "../../../../../../../components/spreadsheet-kit/gutter-cell";
import { GutterMenu } from "../../../../../../../components/spreadsheet-kit/gutter-menu";
import { PhantomLine } from "../../../../../../../components/spreadsheet-kit/phantom-line";
import {
  ReorderableRow,
  ReorderableRows,
  rowMoveStep,
} from "../../../../../../../components/spreadsheet-kit/reorderable-rows";
import { useFocusGrid } from "../../../../../../../worksheet/use-focus-grid";
import { useRowSelection } from "../../../../../../../worksheet/use-row-selection";
import { useSelectFirstActivation } from "../../../../../../../worksheet/use-select-first";
import {
  addTerm,
  describeEquationForm,
  moveTerm,
  removeTerm,
  termKeys,
} from "./compose-dynamics";

import type {
  DifferentialEquation,
  ID,
  PlaceDynamicsTerm,
} from "@hashintel/petrinaut-core";

const gutterColumnStyle = css({
  width: "[44px]",
  minWidth: "[44px]",
});

const tokensColumnStyle = css({
  width: "[76px]",
});

// The name cell is a link into the equation, in the display face rather
// than the kit's code face since equation names are titles: the same
// hover wash and focus ring as every cell, and an arrow that shows while
// the row is hovered or the cell focused.
const nameButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  padding: "[4px 8px]",
  fontSize: "xs",
  color: "neutral.s110",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  _hover: {
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 100 116 139) / 0.06)]",
  },
  _focus: {
    outline: "[2px solid rgb(var(--adhoc-accent-rgb, 37 99 235))]",
    outlineOffset: "[-2px]",
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.08)]",
  },
  _disabled: { color: "neutral.s80", cursor: "default" },
  "& [data-open-hint]": { display: "none", color: "neutral.s70" },
  "&:is(tr:hover *) [data-open-hint], &:focus [data-open-hint]": {
    display: "flex",
  },
});

const nameTextStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const tokensCellStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "xs",
  color: "neutral.s80",
  whiteSpace: "nowrap",
});

/** Grid columns: 0 gutter, 1 equation. */
const PHANTOM_COLUMNS = [0, 1];

export interface DynamicsTableProps {
  terms: readonly PlaceDynamicsTerm[];
  /** Every equation of the net, to name the terms. */
  equations: readonly DifferentialEquation[];
  /** The equations the trailing line offers. */
  candidates: readonly DifferentialEquation[];
  /** Rows can be added, reordered and removed. */
  editable: boolean;
  onChange: (terms: PlaceDynamicsTerm[]) => void;
  /** Open an equation's properties. */
  onOpen: (equationId: ID) => void;
}

export const DynamicsTable: React.FC<DynamicsTableProps> = ({
  terms,
  equations,
  candidates,
  editable,
  onChange,
  onOpen,
}) => {
  const { register, onKeyDown, onFocusCell, attach } = useFocusGrid();
  const rowSelection = useRowSelection();
  const nameActivation = useSelectFirstActivation();
  const phantomActivation = useSelectFirstActivation();
  const gutterRefs = useRef(new Map<number, HTMLButtonElement>());
  const phantomRef = useRef<HTMLButtonElement | null>(null);
  // The trailing line's menu of equations to add, while open.
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLButtonElement | null>(
    null,
  );
  const keys = termKeys(terms);

  const move = (from: number, to: number) => {
    if (from !== to && to >= 0 && to < terms.length) {
      onChange(moveTerm(terms, from, to));
    }
  };

  /** Arrows walk the grid; Alt with an arrow moves the row instead. */
  const cellKeyDown =
    (index: number, column: number): React.KeyboardEventHandler =>
    (event) => {
      const step = editable ? rowMoveStep(event) : null;
      if (step === null) {
        onKeyDown(index, column)(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const to = index + step;
      if (to >= 0 && to < terms.length) {
        move(index, to);
        onFocusCell(to, column);
        // The gutter keeps focus through the move, so no focus event
        // follows to move the row highlight.
        if (column === 0) {
          rowSelection.setFocusedRow(to);
        }
      }
    };

  const remove = (index: number) => {
    onChange(removeTerm(terms, index));
    // After React commits the removal: the row that slid into place, or
    // the trailing line once the last row went.
    const remaining = terms.length - 1;
    setTimeout(() => {
      if (remaining > 0) {
        gutterRefs.current.get(Math.min(index, remaining - 1))?.focus();
      } else {
        phantomRef.current?.focus();
      }
    }, 0);
  };

  const add = (equationId: ID) => {
    onChange(addTerm(terms, equationId));
    // The added row's gutter, once it exists.
    const index = terms.length;
    setTimeout(() => gutterRefs.current.get(index)?.focus(), 0);
  };

  const showPhantom = editable && candidates.length > 0;

  return (
    <FormSpreadsheet
      attach={attach}
      ariaLabel="Composed equations"
      minWidth={220}
    >
      <thead>
        <tr>
          <th
            aria-label="Row"
            className={cx(gutterHeaderStyle, gutterColumnStyle)}
          />
          <th className={labelHeaderStyle}>Equation</th>
          <th className={cx(labelHeaderStyle, tokensColumnStyle)}>Tokens</th>
        </tr>
      </thead>
      <ReorderableRows ids={keys} onMove={move} disabled={!editable}>
        {terms.map((term, index) => {
          const equation = equations.find(
            (candidate) => candidate.id === term.differentialEquationId,
          );
          const name = equation?.name ?? term.differentialEquationId;
          const selected =
            rowSelection.selectedRow === index && selectedRowCellStyle;
          return (
            <ReorderableRow key={keys[index]} id={keys[index]!}>
              <td className={cx(gutterCellStyle, gutterColumnStyle, selected)}>
                <GutterCell
                  glyph={index + 1}
                  label={`Equation ${index + 1} actions`}
                  menuLabel={`Equation ${index + 1} menu`}
                  items={[
                    {
                      id: "open",
                      label: "Open equation",
                      disabled: equation === undefined,
                    },
                    {
                      id: "remove",
                      label: "Remove equation",
                      destructive: true,
                    },
                  ]}
                  onMenuSelect={(id) => {
                    if (id === "open") {
                      onOpen(term.differentialEquationId);
                    } else if (id === "remove") {
                      remove(index);
                    }
                  }}
                  menuAnchor={
                    rowSelection.menu?.row === index
                      ? rowSelection.menu.anchor
                      : null
                  }
                  onOpenMenu={(anchor) => rowSelection.openMenu(index, anchor)}
                  onCloseMenu={rowSelection.closeMenu}
                  buttonRef={(button) => {
                    register(index, 0)(button);
                    if (button) {
                      gutterRefs.current.set(index, button);
                    } else {
                      gutterRefs.current.delete(index);
                    }
                  }}
                  onFocus={() => rowSelection.setFocusedRow(index)}
                  onBlur={() => rowSelection.setFocusedRow(null)}
                  onKeyDown={cellKeyDown(index, 0)}
                  onDelete={() => remove(index)}
                  readOnly={!editable}
                />
              </td>
              <td className={cx(cellStyle, selected)}>
                <button
                  ref={register(index, 1)}
                  type="button"
                  className={nameButtonStyle}
                  aria-label={`Open ${name}`}
                  title={equation ? "Open the equation" : "Missing equation"}
                  disabled={equation === undefined}
                  onPointerDown={nameActivation.onPointerDown}
                  onClick={(event) => {
                    if (nameActivation.shouldActivate(event)) {
                      onOpen(term.differentialEquationId);
                    }
                  }}
                  onKeyDown={cellKeyDown(index, 1)}
                >
                  <span className={nameTextStyle}>{name}</span>
                  <span data-open-hint aria-hidden>
                    <Icon name="arrowRight" size="xs" />
                  </span>
                </button>
              </td>
              <td className={cx(cellStyle, tokensColumnStyle, selected)}>
                <div className={tokensCellStyle}>
                  {equation ? describeEquationForm(equation) : "Missing"}
                </div>
              </td>
            </ReorderableRow>
          );
        })}
        {showPhantom ? (
          <PhantomLine
            gutterLabel="Add an equation from the gutter"
            onMaterialize={() => {
              if (phantomRef.current) {
                setAddMenuAnchor(phantomRef.current);
              }
            }}
            gutterClassName={gutterColumnStyle}
          >
            <td colSpan={2} className={cx(cellStyle, phantomRowCellStyle)}>
              <button
                ref={(button) => {
                  phantomRef.current = button;
                  for (const column of PHANTOM_COLUMNS) {
                    register(terms.length, column)(button);
                  }
                }}
                type="button"
                className={phantomCellButtonStyle}
                aria-label="Add an equation"
                aria-haspopup="menu"
                aria-expanded={addMenuAnchor !== null}
                onPointerDown={phantomActivation.onPointerDown}
                onClick={(event) => {
                  if (phantomActivation.shouldActivate(event)) {
                    setAddMenuAnchor(event.currentTarget);
                  }
                }}
                onKeyDown={onKeyDown(terms.length, 0)}
              >
                Add an equation…
              </button>
              {addMenuAnchor ? (
                <GutterMenu
                  anchor={addMenuAnchor}
                  items={candidates.map((equation) => ({
                    id: equation.id,
                    label: `${equation.name} · ${describeEquationForm(equation)}`,
                  }))}
                  onSelect={(id) => {
                    setAddMenuAnchor(null);
                    add(id);
                  }}
                  onClose={() => setAddMenuAnchor(null)}
                  onDismiss={() => {
                    setAddMenuAnchor(null);
                    // After the Popover teardown settles.
                    setTimeout(() => phantomRef.current?.focus(), 0);
                  }}
                />
              ) : null}
            </td>
          </PhantomLine>
        ) : null}
      </ReorderableRows>
    </FormSpreadsheet>
  );
};
