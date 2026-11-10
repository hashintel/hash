/**
 * The Dimensions table of a type: one row per token attribute — a gutter,
 * the name, the value type — in the editor's spreadsheet grammar. Rows
 * reorder by dragging the gutter or with Alt and an arrow key; a quiet
 * trailing line adds a dimension and opens its name for editing; the
 * gutter's menu or Delete removes one, never the last.
 */

import { useRef, useState } from "react";

import { Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { generatePetrinautId, type Color } from "@hashintel/petrinaut-core";

import { FormSpreadsheet } from "../../../../../../components/spreadsheet-kit/form-spreadsheet";
import {
  cellErrorUnderlineStyle,
  cellSelectStyle,
  cellStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  labelHeaderStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  selectedRowCellStyle,
} from "../../../../../../components/spreadsheet-kit/form-table";
import { GutterCell } from "../../../../../../components/spreadsheet-kit/gutter-cell";
import { PhantomLine } from "../../../../../../components/spreadsheet-kit/phantom-line";
import {
  ReorderableRow,
  ReorderableRows,
  rowMoveKeyDown,
} from "../../../../../../components/spreadsheet-kit/reorderable-rows";
import { TextCell } from "../../../../../../components/spreadsheet-kit/text-cell";
import { useFocusGrid } from "../../../../../../worksheet/use-focus-grid";
import { useRowSelection } from "../../../../../../worksheet/use-row-selection";
import { useSelectFirstActivation } from "../../../../../../worksheet/use-select-first";
import { useTypePropertiesContext } from "../context";
import {
  dimensionNameError,
  dimensionTypeOptions,
  nextDimensionName,
  slugifyToIdentifier,
} from "./dimensions";

type Dimension = Color["elements"][number];

const gutterColumnStyle = css({
  width: "[44px]",
  minWidth: "[44px]",
});

const typeColumnStyle = css({
  width: "[96px]",
});

const emptyStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontStyle: "italic",
  padding: "2",
  backgroundColor: "neutral.a05",
  borderRadius: "sm",
  textAlign: "center",
});

/** Grid columns: 0 gutter, 1 name, 2 type. */
const PHANTOM_COLUMNS = [0, 1, 2];

export interface DimensionsTableProps {
  /** Rows cannot be added, renamed, retyped, reordered or removed. */
  readOnly: boolean;
}

export const DimensionsTable: React.FC<DimensionsTableProps> = ({
  readOnly,
}) => {
  const {
    type,
    addTypeElement,
    updateTypeElement,
    removeTypeElement,
    moveTypeElement,
  } = useTypePropertiesContext();
  const { elements } = type;
  const grid = useFocusGrid();
  const { register, attach } = grid;
  const rowSelection = useRowSelection();
  const phantomActivation = useSelectFirstActivation();
  const gutterRefs = useRef(new Map<number, HTMLButtonElement>());
  // The name being typed, until Enter or leaving the cell commits it.
  const [draft, setDraft] = useState<{
    elementId: string;
    text: string;
  } | null>(null);
  // The dimension just added, whose name cell opens for editing.
  const [added, setAdded] = useState<{
    elementId: string;
    nonce: number;
  } | null>(null);

  const move = (from: number, to: number) => {
    const element = elements[from];
    if (element) {
      moveTypeElement({
        typeId: type.id,
        elementId: element.elementId,
        toIndex: to,
      });
    }
  };

  const cellKeyDown = rowMoveKeyDown({
    grid,
    setFocusedRow: rowSelection.setFocusedRow,
    rowCount: elements.length,
    onMove: move,
    readOnly,
  });

  /** Arrows on a closed type select walk the grid; open, they are its own. */
  const selectCellKeyDown =
    (index: number): React.KeyboardEventHandler =>
    (event) => {
      const trigger = (event.currentTarget as HTMLElement).querySelector(
        "[data-part='trigger']",
      );
      if (trigger?.getAttribute("aria-expanded") === "true") {
        return;
      }
      cellKeyDown(index, 2)(event);
    };

  const addDimension = () => {
    const element: Dimension = {
      elementId: generatePetrinautId(),
      name: nextDimensionName(elements),
      type: "real",
    };
    addTypeElement({ typeId: type.id, element });
    setAdded((previous) => ({
      elementId: element.elementId,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const deleteDimension = (index: number) => {
    const element = elements[index];
    if (!element || elements.length <= 1) {
      return;
    }
    removeTypeElement({ typeId: type.id, elementId: element.elementId });
    // After React commits the removal, the row that slid into place.
    const remaining = elements.length - 1;
    setTimeout(() => {
      gutterRefs.current.get(Math.min(index, remaining - 1))?.focus();
    }, 0);
  };

  /** The draft while this element's name is being edited. */
  const draftOf = (element: Dimension): string | null =>
    draft !== null && draft.elementId === element.elementId ? draft.text : null;

  const nameOf = (element: Dimension): string =>
    draftOf(element) ?? element.name;

  const nameErrorOf = (element: Dimension): string | undefined => {
    const text = draftOf(element);
    return text === null
      ? undefined
      : (dimensionNameError(elements, element.elementId, text) ?? undefined);
  };

  /** Saves the draft as an identifier; a refused name reverts. */
  const commitName = (element: Dimension) => {
    const text = draftOf(element);
    if (text === null) {
      return;
    }
    setDraft(null);
    const name = slugifyToIdentifier(text);
    if (
      name !== element.name &&
      dimensionNameError(elements, element.elementId, text) === null
    ) {
      updateTypeElement({
        typeId: type.id,
        elementId: element.elementId,
        update: { name },
      });
    }
  };

  if (readOnly && elements.length === 0) {
    return <div className={emptyStyle}>No dimensions.</div>;
  }

  return (
    <FormSpreadsheet attach={attach} ariaLabel="Dimensions" minWidth={220}>
      <thead>
        <tr>
          <th
            aria-label="Row"
            className={cx(gutterHeaderStyle, gutterColumnStyle)}
          />
          <th className={labelHeaderStyle}>Name</th>
          <th className={cx(labelHeaderStyle, typeColumnStyle)}>Type</th>
        </tr>
      </thead>
      <ReorderableRows
        ids={elements.map((element) => element.elementId)}
        onMove={move}
        readOnly={readOnly}
      >
        {elements.map((element, index) => {
          const selected =
            rowSelection.selectedRow === index && selectedRowCellStyle;
          const error = nameErrorOf(element);
          return (
            <ReorderableRow key={element.elementId} id={element.elementId}>
              <td className={cx(gutterCellStyle, gutterColumnStyle, selected)}>
                <GutterCell
                  glyph={index + 1}
                  label={`Dimension ${index + 1} actions`}
                  menuLabel={`Dimension ${index + 1} menu`}
                  items={[
                    {
                      id: "delete",
                      label: "Delete dimension",
                      destructive: true,
                      disabled: elements.length <= 1,
                    },
                  ]}
                  onMenuSelect={(id) => {
                    if (id === "delete") {
                      deleteDimension(index);
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
                  onDelete={() => deleteDimension(index)}
                  readOnly={readOnly}
                />
              </td>
              <td
                className={cx(
                  cellStyle,
                  error && cellErrorUnderlineStyle,
                  selected,
                )}
              >
                <TextCell
                  value={nameOf(element)}
                  ariaLabel={`Name of dimension ${index + 1}`}
                  error={error}
                  placeholder="dimension_name"
                  autoEdit={
                    added?.elementId === element.elementId ? added.nonce : 0
                  }
                  onChange={(text) =>
                    setDraft({ elementId: element.elementId, text })
                  }
                  onCommit={() => commitName(element)}
                  onCancel={() => setDraft(null)}
                  cellRef={register(index, 1)}
                  onCellKeyDown={cellKeyDown(index, 1)}
                  readOnly={readOnly}
                />
              </td>
              {/* The Select drops className, so its cell styles the box
                  and registers the trigger for the grid. */}
              <td
                ref={(cell) =>
                  register(
                    index,
                    2,
                  )(
                    cell
                      ? cell.querySelector<HTMLElement>("[data-part='trigger']")
                      : null,
                  )
                }
                className={cx(
                  cellStyle,
                  typeColumnStyle,
                  cellSelectStyle,
                  selected,
                )}
                onKeyDownCapture={selectCellKeyDown(index)}
              >
                <Select
                  required
                  size="sm"
                  aria-label={`Type of ${element.name}`}
                  value={element.type}
                  onChange={(elementType) =>
                    updateTypeElement({
                      typeId: type.id,
                      elementId: element.elementId,
                      update: { type: elementType },
                    })
                  }
                  items={dimensionTypeOptions}
                  disabled={readOnly}
                />
              </td>
            </ReorderableRow>
          );
        })}
        {readOnly ? null : (
          <PhantomLine
            gutterLabel="Add a dimension from the gutter"
            onMaterialize={addDimension}
            gutterClassName={gutterColumnStyle}
          >
            <td colSpan={2} className={cx(cellStyle, phantomRowCellStyle)}>
              <button
                ref={(button) => {
                  for (const column of PHANTOM_COLUMNS) {
                    register(elements.length, column)(button);
                  }
                }}
                type="button"
                className={phantomCellButtonStyle}
                aria-label="Add a dimension"
                onPointerDown={phantomActivation.onPointerDown}
                onClick={(event) => {
                  if (phantomActivation.shouldActivate(event)) {
                    addDimension();
                  }
                }}
                onKeyDown={grid.onKeyDown(elements.length, 0)}
              >
                Add a dimension…
              </button>
            </td>
          </PhantomLine>
        )}
      </ReorderableRows>
    </FormSpreadsheet>
  );
};
