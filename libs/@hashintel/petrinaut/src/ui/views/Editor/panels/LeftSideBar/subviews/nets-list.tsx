import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";

import type { SubView } from "../../../../../components/sub-view/types";

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
      "& [data-delete]": { opacity: "[1]" },
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

const deleteButtonStyle = css({
  flexShrink: 0,
  opacity: "[0]",
  transition: "[opacity 100ms ease-out]",
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

const NetsListContent: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { activeSubnetId, setActiveSubnetId } = use(ActiveNetContext);
  const { clearSelection } = use(EditorContext);
  const { updateSubnet, removeSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);

  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const handleSelect = (subnetId: string | null) => {
    setActiveSubnetId(subnetId);
    clearSelection();
  };

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

  return (
    <div className={listStyle} role="listbox" aria-label="Nets">
      <div
        className={itemStyle({ active: activeSubnetId === null })}
        onClick={() => handleSelect(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            handleSelect(null);
          }
        }}
        role="option"
        aria-selected={activeSubnetId === null}
        tabIndex={0}
      >
        <span className={iconStyle}>
          <Icon name="diagramProject" size="xs" />
        </span>
        Root
      </div>
      {(subnets ?? []).map((subnet) => (
        <div
          key={subnet.id}
          className={itemStyle({ active: activeSubnetId === subnet.id })}
          onClick={() => {
            if (editingId !== subnet.id) {
              handleSelect(subnet.id);
            }
          }}
          onDoubleClick={() => startEditing(subnet.id, subnet.name)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect(subnet.id);
            }
          }}
          role="option"
          aria-selected={activeSubnetId === subnet.id}
          tabIndex={0}
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
            <span role="none" data-delete className={deleteButtonStyle}>
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
                  if (activeSubnetId === subnet.id) {
                    setActiveSubnetId(null);
                  }
                  removeSubnet({ subnetId: subnet.id });
                }}
              />
            </span>
          )}
        </div>
      ))}
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
