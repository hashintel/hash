import { Box, Typography } from "@mui/material";
import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  componentsFromVersionedUrl,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import { Button, Combobox, Icon } from "@hashintel/ds-components";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { useDataTypesContext } from "../data-types-context";
import { useSlideStack } from "../slide-stack/context";
import {
  buildDataTypeTree,
  getDataTypeIconName,
} from "./allowed-types-field/data-type-tree";
import { ListEntryEditor } from "./allowed-types-field/list-entry-editor";
import {
  sharedParentPrimitive,
  summarizeTypeTitles,
} from "./shared/constraint-config";
import {
  defaultListConfig,
  listDataTypeBaseUrl,
  listDataTypeId,
  listDataTypeTitle,
} from "./shared/list-config";
import { primitiveRootTypeByBaseUrl } from "./shared/primitive-root-types";

import type {
  DataTypeTree,
  DataTypeTreeNode,
} from "./allowed-types-field/data-type-tree";
import type { ConstraintPrimitive } from "./shared/constraint-config";
import type { ListConfig } from "./shared/list-config";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ComboboxItem } from "@hashintel/ds-components";
import type { Ref } from "react";

export type AllowedTypeRelation = "parent" | "child";

export type AllowedTypesFieldHandle = {
  /** Opens the add-type picker, or closes it if already open */
  toggleAddPicker: () => void;
};

export type AllowedTypeEntry =
  | { relation: AllowedTypeRelation; dataTypeId: VersionedUrl }
  | { relation: "list"; config: ListConfig };

type DisabledReason = string;

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;

type ActivePicker = { kind: "add" } | { kind: "edit"; index: number };

const rowBorderColor = "#f3f3f3";

/** How deep the nested child-type rows of abstract types may expand */
const maxExpansionDepth = 10;

const expansionChevronWidth = 26;

const DataTypeOptionContent = ({
  node,
  reason,
  onOpen,
}: {
  node: DataTypeTreeNode;
  reason?: DisabledReason | null;
  /** Makes the title a link: plain click calls this, modified clicks follow the href */
  onOpen?: () => void;
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
    {onOpen ? (
      <Typography
        component="a"
        href={generateLinkParameters(node.$id).href}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onOpen();
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: "nowrap",
          color: ({ palette }) => palette.gray[90],
          textDecoration: "none",
          "&:hover, &:focus-visible": {
            color: ({ palette }) => palette.blue[70],
            textDecoration: "underline",
          },
          "&:hover .open-type-icon, &:focus-visible .open-type-icon": {
            opacity: 1,
          },
        }}
      >
        {node.title}
        <Box
          component="span"
          className="open-type-icon"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            marginLeft: 0.5,
            opacity: 0,
            transition: "opacity 0.15s",
          }}
        >
          <Icon name="arrowUpRight" size="xs" />
        </Box>
      </Typography>
    ) : (
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
    )}
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
  readonly,
  visibleRelations,
  handle,
  addDisabledReason,
  addRelation,
  childCompatibility,
}: {
  value: AllowedTypeEntry[];
  onChange: (value: AllowedTypeEntry[]) => void;
  excludedBaseUrl?: BaseUrl;
  canEditDataType: (dataTypeId: VersionedUrl) => boolean;
  /** Render the rows without edit/remove actions or an add affordance */
  readonly?: boolean;
  /** Show only rows of these relations; edits still act on the full value */
  visibleRelations?: AllowedTypeEntry["relation"][];
  /** Lets the parent's own add button open the in-body type picker */
  handle?: Ref<AllowedTypesFieldHandle>;
  /**
   * Disables every data-type pick in the add picker with this reason — list
   * picks stay available, as they reference no other type
   */
  addDisabledReason?: string;
  /**
   * The relation added entries take. Defaults to the first pick becoming the
   * parent and later picks children.
   */
  addRelation?: AllowedTypeRelation;
  /**
   * The primitive a child pick must share with the edited type — a child's
   * constraints must compose with the type it implements, so picks of any
   * other primitive are disabled. The title names the edited type in the
   * disabled reason. Absent, child picks are unconstrained.
   */
  childCompatibility?: {
    primitive: ConstraintPrimitive;
    title: string;
  } | null;
}) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();
  const { pushToSlideStack } = useSlideStack();

  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useImperativeHandle(handle, () => ({
    toggleAddPicker: () =>
      setActivePicker((previous) =>
        previous?.kind === "add" ? null : { kind: "add" },
      ),
  }));

  const toggleExpanded = (path: string) =>
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

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
    if (!latest) {
      return null;
    }

    const latestNode = tree.nodeById.get(latest.schema.$id);
    if (latestNode) {
      return latestNode;
    }

    // A type whose only ancestry path runs through the excluded (edited)
    // type is absent from the tree — synthesize a standalone display node
    const { schema } = latest;
    return {
      $id: schema.$id,
      abstract: schema.abstract ?? false,
      baseUrl: latest.metadata.recordId.baseUrl,
      children: [],
      description: schema.description,
      directParents: [],
      label: schema.label ?? {},
      title: schema.title,
      type: "anyOf" in schema ? schema.anyOf[0].type : schema.type,
      version: componentsFromVersionedUrl(schema.$id).version,
    };
  };

  const entryDataTypeId = (entry: AllowedTypeEntry): VersionedUrl =>
    entry.relation === "list" ? listDataTypeId : entry.dataTypeId;

  /** `null` for anyOf-typed (union) and unknown types */
  const resolvePrimitive = (
    dataTypeId: VersionedUrl,
  ): ConstraintPrimitive | null => {
    const schema = (
      dataTypes?.[dataTypeId] ?? latestDataTypes?.[extractBaseUrl(dataTypeId)]
    )?.schema;

    if (schema) {
      return "anyOf" in schema ? null : schema.type;
    }

    return (
      primitiveRootTypeByBaseUrl.get(extractBaseUrl(dataTypeId))?.type ?? null
    );
  };

  /** Every base URL reachable upward through stored `allOf` chains */
  const ancestorBaseUrls = (startBaseUrls: BaseUrl[]): Set<BaseUrl> => {
    const visited = new Set<BaseUrl>();
    const queue = [...startBaseUrls];
    while (queue.length > 0) {
      const baseUrl = queue.pop();
      if (baseUrl === undefined || visited.has(baseUrl)) {
        continue;
      }
      visited.add(baseUrl);
      for (const { $ref } of latestDataTypes?.[baseUrl]?.schema.allOf ?? []) {
        queue.push(extractBaseUrl($ref));
      }
    }
    return visited;
  };

  /** Every base URL reachable downward: types extending the roots transitively */
  const descendantBaseUrls = (rootBaseUrls: BaseUrl[]): Set<BaseUrl> => {
    const childrenByParent = new Map<BaseUrl, BaseUrl[]>();
    for (const dataType of Object.values(latestDataTypes ?? {})) {
      for (const { $ref } of dataType.schema.allOf ?? []) {
        const parentBaseUrl = extractBaseUrl($ref);
        childrenByParent.set(parentBaseUrl, [
          ...(childrenByParent.get(parentBaseUrl) ?? []),
          dataType.metadata.recordId.baseUrl,
        ]);
      }
    }

    const visited = new Set<BaseUrl>();
    const queue = [...rootBaseUrls];
    while (queue.length > 0) {
      const baseUrl = queue.pop();
      if (baseUrl === undefined || visited.has(baseUrl)) {
        continue;
      }
      visited.add(baseUrl);
      queue.push(...(childrenByParent.get(baseUrl) ?? []));
    }
    return visited;
  };

  const makeGetDisabledReason = ({
    editedIndex,
    requireEditable,
    pickRelation,
  }: {
    editedIndex?: number;
    requireEditable: boolean;
    /** The relation the picked type would take to the edited type */
    pickRelation: AllowedTypeRelation;
  }) => {
    const otherParents =
      pickRelation === "parent"
        ? value.filter(
            (entry, index): entry is ReferenceEntry =>
              index !== editedIndex && entry.relation === "parent",
          )
        : [];

    // A parent pick also binds the staged children: they inherit its
    // primitive, so a parent they don't share one with would break them
    const otherChildren =
      pickRelation === "parent"
        ? value.filter(
            (entry, index): entry is ReferenceEntry =>
              index !== editedIndex && entry.relation === "child",
          )
        : [];

    /**
     * Constraints only compose across parents sharing one primitive — the
     * graph intersects every parent's constraints with each own value arm,
     * so e.g. a Text parent both rejects number parents and strips a list
     * arm from the closed type. List entries therefore demand array-typed
     * parents, the same way List is unpickable once a Text parent exists.
     * When the existing selection already disagrees nothing extra is
     * disabled: any pick leaves it mixed, and replacing an entry is how the
     * user recovers.
     */
    const hasOtherListEntries =
      pickRelation === "parent" &&
      value.some(
        (entry, index) => index !== editedIndex && entry.relation === "list",
      );

    const parentPrimitive = sharedParentPrimitive({
      parentDataTypeIds: otherParents.map((entry) => entry.dataTypeId),
      resolvePrimitive,
    });
    const childrenPrimitive = sharedParentPrimitive({
      parentDataTypeIds: otherChildren.map((entry) => entry.dataTypeId),
      resolvePrimitive,
    });

    const primitiveConstraints = [
      ...(otherParents.length > 0 ? [parentPrimitive] : []),
      ...(hasOtherListEntries ? ["array" as const] : []),
      ...(otherChildren.length > 0 ? [childrenPrimitive] : []),
    ];
    const firstConstraint = primitiveConstraints[0] ?? null;
    const requiredPrimitive =
      firstConstraint !== null &&
      primitiveConstraints.every((primitive) => primitive === firstConstraint)
        ? firstConstraint
        : null;

    const combinedWithTitles = [
      ...[...otherParents, ...otherChildren]
        .map((entry) => resolveNode(entry.dataTypeId)?.title)
        .filter((title): title is string => title !== undefined),
      ...(hasOtherListEntries ? [listDataTypeTitle] : []),
    ];

    /**
     * Inheritance must stay acyclic. A child pick gains the edited type in
     * its allOf, so anything the edited type will extend is off-limits; a
     * parent pick joins the edited type's allOf, so anything extending it —
     * including through a staged child — is off-limits.
     */
    const stagedBaseUrls = (relation: AllowedTypeRelation) =>
      value
        .filter(
          (entry, index): entry is ReferenceEntry =>
            index !== editedIndex && entry.relation === relation,
        )
        .map((entry) => extractBaseUrl(entry.dataTypeId));

    const cycleBaseUrls =
      pickRelation === "child"
        ? ancestorBaseUrls(stagedBaseUrls("parent"))
        : descendantBaseUrls([
            ...(excludedBaseUrl ? [excludedBaseUrl] : []),
            ...stagedBaseUrls("child"),
          ]);

    return (node: DataTypeTreeNode): DisabledReason | null => {
      if (
        requiredPrimitive !== null &&
        combinedWithTitles.length > 0 &&
        resolvePrimitive(node.$id) !== requiredPrimitive
      ) {
        return `Can't combine with ${summarizeTypeTitles(combinedWithTitles)}`;
      }

      if (
        pickRelation === "child" &&
        childCompatibility &&
        resolvePrimitive(node.$id) !== childCompatibility.primitive
      ) {
        return `Can't combine with ${childCompatibility.title}`;
      }

      // Lists carry their own per-entry configuration rather than referencing
      // another data type, so they can be added repeatedly and need no
      // permission — but a field that can't display list rows would make the
      // pick vanish from view.
      if (node.baseUrl === listDataTypeBaseUrl) {
        return visibleRelations === undefined ||
          visibleRelations.includes("list")
          ? null
          : "Can't be added here";
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

      if (cycleBaseUrls.has(node.baseUrl)) {
        return "Would create an inheritance cycle";
      }

      if (requireEditable && !canEditDataType(node.$id)) {
        return "No permission to edit";
      }

      return null;
    };
  };

  const hasParentEntry = (excludedIndex?: number) =>
    value.some(
      (entry, index) => index !== excludedIndex && entry.relation === "parent",
    );

  /** The relation the add picker's next pick takes */
  const addPickRelation =
    addRelation ?? (hasParentEntry() ? "child" : "parent");

  const handleAdd = (dataTypeId: VersionedUrl) => {
    const entry: AllowedTypeEntry =
      extractBaseUrl(dataTypeId) === listDataTypeBaseUrl
        ? { relation: "list", config: defaultListConfig() }
        : { dataTypeId, relation: addPickRelation };

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
    if (readonly) {
      return null;
    }

    return (
      <Box data-allowed-types-picker ref={containerRef}>
        <DataTypePicker
          tree={tree}
          value={null}
          onPick={handleAdd}
          getDisabledReason={makeGetDisabledReason({
            // Extending a type doesn't modify it; becoming its parent does
            requireEditable: addPickRelation === "child",
            pickRelation: addPickRelation,
          })}
        />
      </Box>
    );
  }

  const visibleEntries = value
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        visibleRelations === undefined ||
        visibleRelations.includes(entry.relation),
    );

  /**
   * The indented rows revealed under an expanded abstract type: its child
   * types, themselves expandable while abstract, up to the depth cap.
   */
  const renderChildRows = (
    parentNode: DataTypeTreeNode,
    parentPath: string,
    depth: number,
  ): React.ReactNode =>
    parentNode.children.map((child) => {
      const path = `${parentPath}/${child.$id}`;
      const expandable =
        child.abstract &&
        child.children.length > 0 &&
        depth < maxExpansionDepth;
      const isExpanded = expandable && expandedPaths.has(path);

      return (
        <Fragment key={path}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              padding: "4px 8px",
              paddingLeft: `${12 + depth * 24}px`,
              borderTop: `1px solid ${rowBorderColor}`,
            }}
          >
            {expandable ? (
              <Button
                variant="ghost"
                size="xs"
                iconName={isExpanded ? "chevronDown" : "chevronRight"}
                tooltip={
                  isExpanded
                    ? `Collapse ${child.title}`
                    : `Expand ${child.title}`
                }
                onClick={() => toggleExpanded(path)}
              />
            ) : (
              <Box sx={{ width: expansionChevronWidth, flexShrink: 0 }} />
            )}
            <DataTypeOptionContent
              node={child}
              onOpen={() =>
                pushToSlideStack({ kind: "dataType", itemId: child.$id })
              }
            />
          </Box>
          {isExpanded ? renderChildRows(child, path, depth + 1) : null}
        </Fragment>
      );
    });

  const anyEntryExpandable = visibleEntries.some(({ entry }) => {
    if (entry.relation === "list") {
      return false;
    }
    const node = resolveNode(entry.dataTypeId);
    return !!node && node.abstract && node.children.length > 0;
  });

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
      {visibleEntries.length > 0 ? (
        <Box
          sx={{
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            borderRadius: "10px",
          }}
        >
          {visibleEntries.map(({ entry, index }, ordinal) => {
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
                    borderTop:
                      ordinal > 0 ? `1px solid ${rowBorderColor}` : "none",
                  }}
                >
                  <DataTypePicker
                    tree={tree}
                    value={node?.$id ?? null}
                    onPick={(dataTypeId) => handleReplace(index, dataTypeId)}
                    getDisabledReason={makeGetDisabledReason({
                      editedIndex: index,
                      requireEditable: wouldBeChild,
                      pickRelation: wouldBeChild ? "child" : "parent",
                    })}
                    autoFocus
                  />
                </Box>
              );
            }

            const entryPath = `entry-${index}:${node?.$id ?? ""}`;
            const expandable =
              !isList && !!node && node.abstract && node.children.length > 0;
            const isExpanded = expandable && expandedPaths.has(entryPath);

            return (
              <Fragment key={entryKey}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    padding: "6px 8px 6px 12px",
                    borderTop:
                      ordinal > 0 ? `1px solid ${rowBorderColor}` : "none",
                  }}
                >
                  {expandable ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      iconName={isExpanded ? "chevronDown" : "chevronRight"}
                      tooltip={
                        isExpanded
                          ? `Collapse ${node.title}`
                          : `Expand ${node.title}`
                      }
                      onClick={() => toggleExpanded(entryPath)}
                    />
                  ) : anyEntryExpandable ? (
                    <Box sx={{ width: expansionChevronWidth, flexShrink: 0 }} />
                  ) : null}
                  {node ? (
                    <DataTypeOptionContent
                      node={node}
                      // A list row is inline configuration, not a type reference
                      onOpen={
                        isList
                          ? undefined
                          : () =>
                              pushToSlideStack({
                                kind: "dataType",
                                itemId: node.$id,
                              })
                      }
                    />
                  ) : (
                    <Typography component="span" sx={{ fontSize: 14, flex: 1 }}>
                      {isList ? "List" : entry.dataTypeId}
                    </Typography>
                  )}
                  {readonly ? null : (
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
                            value.filter(
                              (_, entryIndex) => entryIndex !== index,
                            ),
                          )
                        }
                      />
                    </Box>
                  )}
                </Box>
                {isList ? (
                  <ListEntryEditor
                    config={entry.config}
                    readonly={readonly}
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
                {isExpanded ? renderChildRows(node, entryPath, 1) : null}
              </Fragment>
            );
          })}
        </Box>
      ) : null}

      {!readonly && activePicker?.kind === "add" ? (
        <Box
          sx={{ marginTop: visibleEntries.length > 0 ? 1.5 : 0 }}
          data-allowed-types-picker
        >
          <DataTypePicker
            tree={tree}
            value={null}
            onPick={handleAdd}
            getDisabledReason={(node) =>
              addDisabledReason && node.baseUrl !== listDataTypeBaseUrl
                ? addDisabledReason
                : makeGetDisabledReason({
                    // Extending a type doesn't modify it; becoming its parent
                    // does
                    requireEditable: addPickRelation === "child",
                    pickRelation: addPickRelation,
                  })(node)
            }
            autoFocus
          />
        </Box>
      ) : null}
    </Box>
  );
};
