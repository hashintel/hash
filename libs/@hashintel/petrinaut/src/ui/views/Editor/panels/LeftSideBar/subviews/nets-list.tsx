import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";
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
    /* The delete button shows on hover or while the row or the button holds
       focus. Hidden with `display` so it takes no width until shown. */
    "& [data-row-action]": {
      display: "none",
    },
    "&:focus-within [data-row-action]": {
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
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { addSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add subnet"
      size="xs"
      variant="ghost"
      iconName="plus"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add subnet"}
      onClick={() => {
        const count = (subnets ?? []).length;
        addSubnet({
          id: `subnet__${generateUuid()}`,
          name: `Subnet ${count + 1}`,
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

const NetsListContent: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { activeSubnetId, setActiveSubnetId } = use(ActiveNetContext);
  const { updateSubnet, removeSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  const stops: FocusStop[] = [
    { id: ROOT_STOP_ID, kind: "row" },
    ...(subnets ?? []).map(
      (subnet): FocusStop => ({
        id: subnet.id,
        kind: "row",
      }),
    ),
  ];

  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    // Column 0 is the row, column 1 its delete button.
    columnCount: 2,
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

  const startEditing = (subnetId: string, currentName: string) => {
    if (isReadOnly) return;
    setEditingId(subnetId);
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
      updateSubnet({ subnetId: editingId, update: { name: trimmed } });
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    cancellingRef.current = true;
    setEditingId(null);
  };

  const deleteSubnet = (subnetId: string) => {
    if (activeSubnetId === subnetId) {
      setActiveSubnetId(null);
    }
    removeSubnet({ subnetId });
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
        !isReadOnly
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
        deleteSubnet(stopId);
        return;
      }
      onStopsKeyDown({ stopId, column: 0 })(event);
    };

  const rowFocusProps = (stopId: string) => {
    const rowTarget: FocusStopTarget = { stopId, column: 0 };
    return {
      ref: registerTarget(rowTarget),
      onFocus: (event: React.FocusEvent) => {
        // Focus bubbles: the rename input and the delete button report their
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
        className={itemStyle({ active: activeSubnetId === null })}
        onClick={() => setActiveSubnetId(null)}
        onKeyDown={onRowKeyDown(ROOT_STOP_ID, () => setActiveSubnetId(null))}
        role="option"
        aria-selected={activeSubnetId === null}
        tabIndex={tabIndexFor({ stopId: ROOT_STOP_ID, column: 0 })}
      >
        <span className={iconStyle}>
          <Icon name="diagramProject" size="xs" />
        </span>
        Root
      </div>
      {(subnets ?? []).map((subnet) => {
        const actionTarget: FocusStopTarget = {
          stopId: subnet.id,
          column: 1,
        };
        return (
          <div
            key={subnet.id}
            {...rowFocusProps(subnet.id)}
            className={itemStyle({ active: activeSubnetId === subnet.id })}
            onClick={() => {
              if (editingId !== subnet.id) {
                setActiveSubnetId(subnet.id);
              }
            }}
            onDoubleClick={() => startEditing(subnet.id, subnet.name)}
            onKeyDown={onRowKeyDown(subnet.id, () =>
              setActiveSubnetId(subnet.id),
            )}
            role="option"
            aria-selected={activeSubnetId === subnet.id}
            tabIndex={tabIndexFor({ stopId: subnet.id, column: 0 })}
          >
            <span className={iconStyle}>
              <Icon name="diagramNested" size="xs" />
            </span>
            {editingId === subnet.id ? (
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
              <span className={nameStyle}>{subnet.name}</span>
            )}
            {editingId !== subnet.id && (
              <RowActionCell
                registerButton={registerTarget(actionTarget)}
                onArrowKeyDown={onStopsKeyDown(actionTarget)}
                onButtonFocus={() => onFocusTarget(actionTarget)}
              >
                <Button
                  aria-label="Delete subnet"
                  size="xs"
                  variant="ghost"
                  tone="error"
                  iconName="trash"
                  disabled={isReadOnly}
                  tooltip={
                    isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete subnet"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSubnet(subnet.id);
                  }}
                />
              </RowActionCell>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and reusable subnets. Mark subnet places as ports, then instantiate subnets as components in the root net.",
  component: NetsListContent,
  renderHeaderAction: () => <NetsHeaderAction />,
  defaultCollapsed: false,
};
