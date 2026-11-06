import { Box, Typography } from "@mui/material";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { Button, Combobox, Icon } from "@hashintel/ds-components";

import { useDataTypesContext } from "../data-types-context";
import {
  buildDataTypeTree,
  getDataTypeIconName,
} from "./allowed-types-field/data-type-tree";
import { ListEntryEditor } from "./allowed-types-field/list-entry-editor";
import {
  defaultListConfig,
  listDataTypeBaseUrl,
  listDataTypeId,
} from "./shared/list-config";

import type {
  DataTypeTree,
  DataTypeTreeNode,
} from "./allowed-types-field/data-type-tree";
import type { ListConfig } from "./shared/list-config";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ComboboxItem } from "@hashintel/ds-components";

export type AllowedTypeRelation = "parent" | "child";

export type AllowedTypeEntry =
  | { relation: AllowedTypeRelation; dataTypeId: VersionedUrl }
  | { relation: "list"; config: ListConfig };

type DisabledReason = "Already added" | "No permission to edit";

type ActivePicker = { kind: "add" } | { kind: "edit"; index: number };

const rowBorderColor = "#f3f3f3";

const DataTypeOptionContent = ({
  node,
  reason,
}: {
  node: DataTypeTreeNode;
  reason?: DisabledReason | null;
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      minWidth: 0,
      width: "100%",
    }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        color: ({ palette }) => palette.gray[50],
        flexShrink: 0,
      }}
    >
      <Icon name={getDataTypeIconName(node)} size="sm" />
    </Box>
    <Typography
      component="span"
      sx={{
        fontSize: 14,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: ({ palette }) => palette.gray[90],
      }}
    >
      {node.title}
    </Typography>
    <Typography
      component="span"
      sx={{
        fontSize: 14,
        color: ({ palette }) => palette.gray[60],
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
      }}
    >
      {node.description}
    </Typography>
    {reason ? (
      <Typography
        component="span"
        sx={{
          fontSize: 12,
          color: ({ palette }) => palette.gray[50],
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {reason}
      </Typography>
    ) : null}
  </Box>
);

const DataTypePicker = ({
  tree,
  value,
  onPick,
  getDisabledReason,
  autoFocus,
}: {
  tree: DataTypeTree;
  value: VersionedUrl | null;
  onPick: (dataTypeId: VersionedUrl) => void;
  getDisabledReason: (node: DataTypeTreeNode) => DisabledReason | null;
  autoFocus?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // The dropdown has no imperative/controlled open API, but opens on click
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.click();
    }
  }, [autoFocus]);

  const items = useMemo(() => {
    const mapNode = (node: DataTypeTreeNode): ComboboxItem<VersionedUrl> => {
      const base = {
        value: node.$id,
        text: node.title,
        disabled: !!getDisabledReason(node),
        selectedStyle: "radio" as const,
      };

      return node.children.length > 0
        ? { ...base, subItems: node.children.map(mapNode) }
        : base;
    };

    return tree.roots.map(mapNode);
  }, [tree, getDisabledReason]);

  return (
    <Combobox<VersionedUrl>
      items={items}
      value={value}
      onChange={(dataTypeId) => {
        if (dataTypeId) {
          onPick(dataTypeId);
        }
      }}
      renderItem={(dataTypeId) => {
        const node = tree.nodeById.get(dataTypeId);

        if (!node) {
          return dataTypeId;
        }

        return (
          <DataTypeOptionContent node={node} reason={getDisabledReason(node)} />
        );
      }}
      placeholder={`Search ${tree.selectableCount.toLocaleString()} data types…`}
      prefix={{
        content: (
          // 18px sits between the ds icon size tokens (sm 16px, md 24px); the
          // override needs !important to beat the layer-polyfill's boost
          <Box
            sx={{
              display: "inline-flex",
              "& svg": {
                width: "18px !important",
                height: "18px !important",
                minWidth: "18px !important",
              },
            }}
          >
            <Icon name="search" size="sm" />
          </Box>
        ),
        variant: "subtle",
      }}
      noMatchMessage={(input) => `No data types match “${input}”.`}
      autoFocus={autoFocus}
      inputRef={inputRef}
      size="md"
      width="fullWidth"
    />
  );
};

export const AllowedTypesField = ({
  value,
  onChange,
  excludedBaseUrl,
  canEditDataType,
}: {
  value: AllowedTypeEntry[];
  onChange: (value: AllowedTypeEntry[]) => void;
  excludedBaseUrl?: BaseUrl;
  canEditDataType: (dataTypeId: VersionedUrl) => boolean;
}) => {
  const { latestDataTypes } = useDataTypesContext();

  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activePicker) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;

      if (
        target?.closest("[data-allowed-types-picker]") ??
        target?.closest('[data-scope="combobox"]')
      ) {
        return;
      }

      setActivePicker(null);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [activePicker]);

  const tree = useMemo(
    () =>
      latestDataTypes
        ? buildDataTypeTree({ latestDataTypes, excludedBaseUrl })
        : null,
    [latestDataTypes, excludedBaseUrl],
  );

  if (!tree) {
    return null;
  }

  const resolveNode = (dataTypeId: VersionedUrl): DataTypeTreeNode | null => {
    const node = tree.nodeById.get(dataTypeId);
    if (node) {
      return node;
    }

    const latest = latestDataTypes?.[extractBaseUrl(dataTypeId)];
    return latest ? (tree.nodeById.get(latest.schema.$id) ?? null) : null;
  };

  const entryDataTypeId = (entry: AllowedTypeEntry): VersionedUrl =>
    entry.relation === "list" ? listDataTypeId : entry.dataTypeId;

  const makeGetDisabledReason =
    ({
      editedIndex,
      requireEditable,
    }: {
      editedIndex?: number;
      requireEditable: boolean;
    }) =>
    (node: DataTypeTreeNode): DisabledReason | null => {
      // Lists carry their own per-entry configuration rather than referencing
      // another data type, so they can be added repeatedly and need no
      // permission
      if (node.baseUrl === listDataTypeBaseUrl) {
        return null;
      }

      const alreadySelected = value.some(
        (entry, index) =>
          index !== editedIndex &&
          entry.relation !== "list" &&
          extractBaseUrl(entry.dataTypeId) === node.baseUrl,
      );

      if (alreadySelected) {
        return "Already added";
      }

      if (requireEditable && !canEditDataType(node.$id)) {
        return "No permission to edit";
      }

      return null;
    };

  const hasParentEntry = (excludedIndex?: number) =>
    value.some(
      (entry, index) => index !== excludedIndex && entry.relation === "parent",
    );

  const handleAdd = (dataTypeId: VersionedUrl) => {
    const entry: AllowedTypeEntry =
      extractBaseUrl(dataTypeId) === listDataTypeBaseUrl
        ? { relation: "list", config: defaultListConfig() }
        : {
            dataTypeId,
            relation: hasParentEntry() ? "child" : "parent",
          };

    onChange([...value, entry]);
    setActivePicker(null);
  };

  const handleReplace = (index: number, dataTypeId: VersionedUrl) => {
    onChange(
      value.map((entry, entryIndex): AllowedTypeEntry => {
        if (entryIndex !== index) {
          return entry;
        }

        if (extractBaseUrl(dataTypeId) === listDataTypeBaseUrl) {
          return entry.relation === "list"
            ? entry
            : { relation: "list", config: defaultListConfig() };
        }

        return {
          dataTypeId,
          relation:
            entry.relation === "list"
              ? hasParentEntry(index)
                ? "child"
                : "parent"
              : entry.relation,
        };
      }),
    );
    setActivePicker(null);
  };

  if (value.length === 0) {
    return (
      <Box data-allowed-types-picker ref={containerRef}>
        <DataTypePicker
          tree={tree}
          value={null}
          onPick={handleAdd}
          getDisabledReason={makeGetDisabledReason({ requireEditable: false })}
        />
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && activePicker) {
          event.stopPropagation();
          setActivePicker(null);
        }
      }}
    >
      <Box
        sx={{
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          borderRadius: "10px",
        }}
      >
        {value.map((entry, index) => {
          const isList = entry.relation === "list";
          const entryKey = isList ? `list-${index}` : entry.dataTypeId;
          const node = resolveNode(entryDataTypeId(entry));
          const isEditing =
            activePicker?.kind === "edit" && activePicker.index === index;

          // Replacing this entry puts the picked type in the same position,
          // so permission to edit is needed wherever a child would result
          const wouldBeChild =
            entry.relation === "child" || (isList && hasParentEntry(index));

          const canModify =
            entry.relation !== "child" || canEditDataType(entry.dataTypeId);

          if (isEditing) {
            return (
              <Box
                key={entryKey}
                data-allowed-types-picker
                sx={{
                  padding: "6px 8px",
                  borderTop: index > 0 ? `1px solid ${rowBorderColor}` : "none",
                }}
              >
                <DataTypePicker
                  tree={tree}
                  value={node?.$id ?? null}
                  onPick={(dataTypeId) => handleReplace(index, dataTypeId)}
                  getDisabledReason={makeGetDisabledReason({
                    editedIndex: index,
                    requireEditable: wouldBeChild,
                  })}
                  autoFocus
                />
              </Box>
            );
          }

          return (
            <Fragment key={entryKey}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  padding: "6px 8px 6px 12px",
                  borderTop: index > 0 ? `1px solid ${rowBorderColor}` : "none",
                }}
              >
                {node ? (
                  <DataTypeOptionContent node={node} />
                ) : (
                  <Typography component="span" sx={{ fontSize: 14, flex: 1 }}>
                    {isList ? "List" : entry.dataTypeId}
                  </Typography>
                )}
                <Box sx={{ display: "flex", gap: 0.25, flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconName="pencil"
                    tooltip={
                      canModify
                        ? "Change type"
                        : "No permission to edit this type"
                    }
                    disabled={!canModify}
                    onClick={() => setActivePicker({ kind: "edit", index })}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    iconName="close"
                    tooltip={
                      canModify
                        ? "Remove type"
                        : "No permission to edit this type"
                    }
                    disabled={!canModify}
                    onClick={() =>
                      onChange(
                        value.filter((_, entryIndex) => entryIndex !== index),
                      )
                    }
                  />
                </Box>
              </Box>
              {isList ? (
                <ListEntryEditor
                  config={entry.config}
                  onChange={(config) =>
                    onChange(
                      value.map((existing, entryIndex) =>
                        entryIndex === index
                          ? { relation: "list", config }
                          : existing,
                      ),
                    )
                  }
                />
              ) : null}
            </Fragment>
          );
        })}
      </Box>

      <Box sx={{ marginTop: 1.5 }} data-allowed-types-picker>
        {activePicker?.kind === "add" ? (
          <DataTypePicker
            tree={tree}
            value={null}
            onPick={handleAdd}
            getDisabledReason={makeGetDisabledReason({ requireEditable: true })}
            autoFocus
          />
        ) : (
          <Button
            variant="subtle"
            size="sm"
            iconName="plus"
            onClick={() => setActivePicker({ kind: "add" })}
          >
            Allow another type
          </Button>
        )}
      </Box>
    </Box>
  );
};
