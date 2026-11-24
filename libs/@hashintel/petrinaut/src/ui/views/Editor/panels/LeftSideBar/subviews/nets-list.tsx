import { use, useEffect, useRef, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { generatePetrinautId, isInterface } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { ComponentGlyph } from "../../../../../components/component-glyph";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { ComponentOptionsPopover } from "./component-options-popover";
import { RowActionCell } from "./row-action-cell";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  FocusStop,
  FocusStopTarget,
} from "../../../../../worksheet/use-focus-stops";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  mx: "-1",
});

const itemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    cursor: "pointer",
    transition: "[background-color 100ms ease-out]",
    _hover: {
      backgroundColor: "neutral.bg.surface.hover",
      "& [data-row-action]": { display: "flex" },
    },
    _focus: {
      outline: "none",
      backgroundColor: "neutral.bg.surface.hover",
    },
    /* The row's buttons show on hover or while the row or a button holds
       focus. Hidden with `display` so they take no width until shown. */
    "& [data-row-action]": {
      display: "none",
    },
    "&:focus-within [data-row-action]": {
      display: "flex",
    },
    /* The options popover hangs off the gear: the gear has to stay laid out
       while it is open, or the popover loses its anchor. */
    "&[data-options-open] [data-row-action]": {
      display: "flex",
    },
  },
  variants: {
    active: {
      true: {
        backgroundColor: "blue.s30",
        fontWeight: "semibold",
        _hover: {
          backgroundColor: "blue.s40",
        },
        _focus: {
          backgroundColor: "blue.s40",
        },
      },
    },
  },
});

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s70",
});

const nameStyle = css({
  flex: "1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: "0",
});

const renameInputStyle = css({
  flex: "1",
  minWidth: "0",
  fontSize: "sm",
  fontWeight: "medium",
  background: "[transparent]",
  border: "none",
  outline: "none",
  color: "[inherit]",
  padding: "0",
  width: "full",
});

const NetsHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { components },
  } = use(SDCPNContext);
  const { addComponent } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add component"
      size="xs"
      variant="ghost"
      iconName="plus"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add component"}
      onClick={() => {
        const count = (components ?? []).length;
        addComponent({
          id: generatePetrinautId(),
          name: `Component ${count + 1}`,
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
          componentInstances: [],
        });
      }}
    />
  );
};

const ROOT_STOP_ID = "root";

const targetKey = (target: FocusStopTarget): string =>
  `${target.stopId}:${target.column}`;

export const NetNavigationList: React.FC<{
  /** Called after a net is picked, so a menu host can close itself. */
  onSelect?: () => void;
}> = ({ onSelect }) => {
  const presentation = usePetrinautPresentation();
  const {
    petriNetDefinition: { components },
  } = use(SDCPNContext);
  const { activeComponentId, setActiveComponentId } = use(ActiveNetContext);
  const { updateComponent, removeComponent } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const mutationActionsVisible = presentation.showMutationActions;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);
  const targets = useRef<Map<string, HTMLElement>>(new Map());
  const [optionsAnchor, setOptionsAnchor] = useState<{
    componentId: string;
    element: Element;
  } | null>(null);
  const optionsComponent = optionsAnchor
    ? (components ?? []).find(({ id }) => id === optionsAnchor.componentId)
    : undefined;

  const stops: FocusStop[] = [
    { id: ROOT_STOP_ID, kind: "row" },
    ...(components ?? []).map((component): FocusStop => ({
      id: component.id,
      kind: "row",
    })),
  ];

  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    // Column 0 is the row, column 1 its options button, column 2 its
    // delete button.
    columnCount: 3,
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });

  const registerTarget =
    (target: FocusStopTarget) => (element: HTMLElement | null) => {
      if (element) {
        targets.current.set(targetKey(target), element);
      } else {
        targets.current.delete(targetKey(target));
      }
    };

  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const handleSelect = (componentId: string | null) => {
    setActiveComponentId(componentId);
    onSelect?.();
  };

  const startEditing = (componentId: string, currentName: string) => {
    if (isReadOnly) return;
    setEditingId(componentId);
    setEditingName(currentName);
  };

  const commitRename = () => {
    if (cancellingRef.current) {
      cancellingRef.current = false;
      return;
    }
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      updateComponent({ componentId: editingId, update: { name: trimmed } });
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    cancellingRef.current = true;
    setEditingId(null);
  };

  const deleteComponent = (componentId: string) => {
    if (activeComponentId === componentId) {
      setActiveComponentId(null);
    }
    removeComponent({ componentId });
  };

  const onRowKeyDown =
    (stopId: string, select: () => void): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        select();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        stopId !== ROOT_STOP_ID &&
        !isReadOnly &&
        // A keyboard delete is a mutation, so a presentation that hides the
        // delete button has to refuse the shortcut too.
        mutationActionsVisible
      ) {
        event.preventDefault();
        event.stopPropagation();
        // Focus a neighbour before the row unmounts, so arrows keep working.
        const index = stops.findIndex((stop) => stop.id === stopId);
        const neighbour = stops[index + 1] ?? stops[index - 1];
        if (neighbour) {
          focusLands(
            targets.current.get(targetKey({ stopId: neighbour.id, column: 0 })),
          );
        }
        deleteComponent(stopId);
        return;
      }
      onStopsKeyDown({ stopId, column: 0 })(event);
    };

  const rowFocusProps = (stopId: string) => {
    const rowTarget: FocusStopTarget = { stopId, column: 0 };
    return {
      ref: registerTarget(rowTarget),
      onFocus: (event: React.FocusEvent) => {
        // Focus bubbles: the rename input and the row's buttons report their
        // own positions.
        if (event.target === event.currentTarget) {
          onFocusTarget(rowTarget);
        }
      },
    };
  };

  return (
    <div ref={attach} className={listStyle} role="listbox" aria-label="Nets">
      <div
        {...rowFocusProps(ROOT_STOP_ID)}
        className={itemStyle({ active: activeComponentId === null })}
        onClick={() => handleSelect(null)}
        onKeyDown={onRowKeyDown(ROOT_STOP_ID, () => handleSelect(null))}
        role="option"
        aria-selected={activeComponentId === null}
        tabIndex={tabIndexFor({ stopId: ROOT_STOP_ID, column: 0 })}
      >
        <span className={iconStyle}>
          <Icon name="diagramProject" size="xs" />
        </span>
        Root
      </div>
      {(components ?? []).map((component) => {
        const optionsTarget: FocusStopTarget = {
          stopId: component.id,
          column: 1,
        };
        const deleteTarget: FocusStopTarget = {
          stopId: component.id,
          column: 2,
        };
        return (
          <div
            key={component.id}
            {...rowFocusProps(component.id)}
            className={itemStyle({
              active: activeComponentId === component.id,
            })}
            data-options-open={
              optionsAnchor?.componentId === component.id ? "" : undefined
            }
            onClick={() => {
              if (editingId !== component.id) {
                handleSelect(component.id);
              }
            }}
            onDoubleClick={() => {
              if (mutationActionsVisible) {
                startEditing(component.id, component.name);
              }
            }}
            onKeyDown={onRowKeyDown(component.id, () =>
              handleSelect(component.id),
            )}
            role="option"
            aria-selected={activeComponentId === component.id}
            tabIndex={tabIndexFor({ stopId: component.id, column: 0 })}
          >
            <span
              className={iconStyle}
              style={{ color: component.displayColor }}
            >
              <ComponentGlyph
                iconSvg={component.iconSvg}
                fallback={
                  isInterface(component) ? "puzzlePiece" : "diagramNested"
                }
                size="xs"
              />
            </span>
            {editingId === component.id ? (
              <input
                ref={inputRef}
                className={renameInputStyle}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={nameStyle}>{component.name}</span>
            )}
            {mutationActionsVisible && editingId !== component.id && (
              <>
                <RowActionCell
                  registerButton={registerTarget(optionsTarget)}
                  onArrowKeyDown={onStopsKeyDown(optionsTarget)}
                  onButtonFocus={() => onFocusTarget(optionsTarget)}
                >
                  <Button
                    aria-label="Component options"
                    size="xs"
                    variant="ghost"
                    iconName="gear"
                    tooltip="Interface, icon and colour"
                    onClick={(event) =>
                      setOptionsAnchor({
                        componentId: component.id,
                        element: event.currentTarget,
                      })
                    }
                  />
                </RowActionCell>
                <RowActionCell
                  registerButton={registerTarget(deleteTarget)}
                  onArrowKeyDown={onStopsKeyDown(deleteTarget)}
                  onButtonFocus={() => onFocusTarget(deleteTarget)}
                >
                  <Button
                    aria-label="Delete component"
                    size="xs"
                    variant="ghost"
                    tone="error"
                    iconName="trash"
                    disabled={isReadOnly}
                    tooltip={
                      isReadOnly
                        ? UI_MESSAGES.READ_ONLY_MODE
                        : "Delete component"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteComponent(component.id);
                    }}
                  />
                </RowActionCell>
              </>
            )}
          </div>
        );
      })}
      {optionsAnchor && optionsComponent && (
        <ComponentOptionsPopover
          // One popover per component: opening another row's starts afresh.
          key={optionsComponent.id}
          component={optionsComponent}
          anchor={optionsAnchor.element}
          onClose={() => setOptionsAnchor(null)}
        />
      )}
    </div>
  );
};

export const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and the document's components. Mark a component's places as ports, then place instances of it in the root net.",
  component: NetNavigationList,
  renderHeaderAction: () => <NetsHeaderAction />,
  headerActionMutates: true,
  defaultCollapsed: false,
};
