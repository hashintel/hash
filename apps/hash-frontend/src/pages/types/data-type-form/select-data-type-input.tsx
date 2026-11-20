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
import {
  Button,
  Chip,
  Combobox,
  Icon,
  Tooltip,
} from "@hashintel/ds-components";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { useDataTypesContext } from "../../shared/data-types-context";
import { useSlideStack } from "../../shared/slide-stack/context";
import { ExtendsListItem } from "./cards/extends-list-item";
import { sharedParentPrimitive, summarizeTypeTitles } from "./constraint-util";
import {
  defaultListConfig,
  listDataTypeBaseUrl,
  listDataTypeId,
  listDataTypeTitle,
} from "./list-util";
import { isLiveDataType } from "./live-data-types";
import {
  isBaseDataTypeBaseUrl,
  primitiveRootTypeByBaseUrl,
  primitiveRootTypes,
} from "./primitive-root-types";
import {
  buildDataTypeTree,
  getDataTypeIconName,
  scopeTreeToRoot,
} from "./select-data-type-input/data-type-tree";

import type { ConstraintPrimitive } from "./constraint-util";
import type { ListConfig } from "./list-util";
import type {
  DataTypeTree,
  DataTypeTreeNode,
} from "./select-data-type-input/data-type-tree";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ComboboxItem } from "@hashintel/ds-components";
import type { Ref } from "react";

export type AllowedTypeRelation = "parent" | "child";

export type SelectDataTypeInputHandle = {
  /** Opens the add-type picker, or closes it if already open */
  toggleAddPicker: () => void;
};

export type AllowedTypeEntry =
  | { relation: AllowedTypeRelation; dataTypeId: VersionedUrl }
  | { relation: "list"; config: ListConfig }
  | { relation: "group" };

/**
 * The picker's synthetic Group option: not a data type, but the explicit way
 * to make the edited type an abstract group of other data types. Never saved
 * — the save path reads the staged member entries instead.
 */
const groupPseudoDataTypeId =
  "https://hash.ai/pseudo-data-type/group/v/1" as VersionedUrl;

const groupPseudoNode: DataTypeTreeNode = {
  $id: groupPseudoDataTypeId,
  abstract: false,
  baseUrl: extractBaseUrl(groupPseudoDataTypeId),
  children: [],
  description: "A group of data types that a value can choose from",
  directParents: [],
  label: {},
  title: "Group",
  type: "string",
  version: componentsFromVersionedUrl(groupPseudoDataTypeId).version,
};

/**
 * The add picker's synthetic "create a new type" action: picking it hands off
 * to the caller's create flow instead of staging an entry.
 */
const createNewPseudoDataTypeId =
  "https://hash.ai/pseudo-data-type/create-new/v/1" as VersionedUrl;

const createNewPseudoNode: DataTypeTreeNode = {
  $id: createNewPseudoDataTypeId,
  abstract: false,
  baseUrl: extractBaseUrl(createNewPseudoDataTypeId),
  children: [],
  description: "Define a new data type",
  directParents: [],
  label: {},
  title: "Create a new type",
  type: "string",
  version: componentsFromVersionedUrl(createNewPseudoDataTypeId).version,
};

type DisabledReason = string;

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;

type ActivePicker = { kind: "add" };

const rowBorderColor = "#f3f3f3";

/** How deep the nested child-type rows of abstract types may expand */
const maxExpansionDepth = 10;

const expansionChevronWidth = 26;

const DataTypeOptionContent = ({
  node,
  reason,
  onOpen,
  version,
  linkedDataTypeId,
}: {
  node: DataTypeTreeNode;
  reason?: DisabledReason | null;
  /** Makes the title a link: plain click calls this, modified clicks follow the href */
  onOpen?: () => void;
  /** The referenced version, shown subtly after the name */
  version?: string;
  /**
   * The id the href targets — the node may be the latest edition standing in
   * for a reference pinned to an older version
   */
  linkedDataTypeId?: VersionedUrl;
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
      <Icon
        name={
          node.$id === groupPseudoDataTypeId
            ? "layer"
            : node.$id === createNewPseudoDataTypeId
              ? "plus"
              : getDataTypeIconName(node)
        }
        size="sm"
      />
    </Box>
    {onOpen ? (
      <Typography
        component="a"
        href={generateLinkParameters(linkedDataTypeId ?? node.$id).href}
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
          minWidth: 0,
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
        <Box
          component="span"
          sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {node.title}
        </Box>
        <Box
          component="span"
          className="open-type-icon"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            marginLeft: 0.5,
            opacity: 0,
            transition: "opacity 0.15s",
            flexShrink: 0,
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
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
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
      // Shrink-proof against the title, but capped: the hint can embed a
      // type's name, which must not push the row wide
      <Typography
        component="span"
        sx={{
          fontSize: 12,
          color: ({ palette }) => palette.gray[50],
          whiteSpace: "nowrap",
          flexShrink: 0,
          maxWidth: "50%",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {reason}
      </Typography>
    ) : null}
    {version ? (
      <Typography
        component="span"
        sx={{
          fontSize: 12,
          color: ({ palette }) => palette.gray[50],
          flexShrink: 0,
        }}
      >
        v{version}
      </Typography>
    ) : null}
  </Box>
);

const DataTypePicker = ({
  tree,
  value,
  onPick,
  onCreateNew,
  getDisabledReason,
  autoFocus,
}: {
  tree: DataTypeTree;
  value: VersionedUrl | null;
  onPick: (dataTypeId: VersionedUrl) => void;
  /**
   * Offer a create-a-new-type action closing the options, called with the
   * typed search text as the new type's starting name. The action's label
   * embeds the typed text, which also keeps it matching the filter.
   */
  onCreateNew?: (typedName: string) => void;
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

  const [typedText, setTypedText] = useState("");
  const typedName = typedText.trim();
  const createNewTitle = typedName
    ? `Create a new type called “${typedName}”`
    : createNewPseudoNode.title;

  const items = useMemo(() => {
    // A type can appear under several parents, so the same value can occur
    // more than once; the dropdown keys hover highlighting and expansion per
    // occurrence internally.
    const mapNode = (node: DataTypeTreeNode): ComboboxItem<VersionedUrl> => {
      const base = {
        value: node.$id,
        text: node.title,
        disabled: !!getDisabledReason(node),
        selectedStyle: "radio" as const,
      };

      return node.children.length > 0
        ? { ...base, subItems: node.children.map((child) => mapNode(child)) }
        : base;
    };

    const mapped: ComboboxItem<VersionedUrl>[] = tree.roots.map((root) =>
      mapNode(root),
    );

    if (onCreateNew) {
      mapped.push({
        value: createNewPseudoDataTypeId,
        text: createNewTitle,
        selectedStyle: "radio" as const,
      });
    }

    return mapped;
  }, [tree, getDisabledReason, onCreateNew, createNewTitle]);

  return (
    <Combobox<VersionedUrl>
      items={items}
      value={value}
      onChangeInput={setTypedText}
      onChange={(dataTypeId) => {
        if (dataTypeId === createNewPseudoDataTypeId) {
          onCreateNew?.(typedName);
          return;
        }
        if (dataTypeId) {
          onPick(dataTypeId);
        }
      }}
      renderItem={(dataTypeId) => {
        if (dataTypeId === createNewPseudoDataTypeId) {
          return (
            <DataTypeOptionContent
              node={{ ...createNewPseudoNode, title: createNewTitle }}
            />
          );
        }

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

export const SelectDataTypeInput = ({
  value,
  onChange,
  excludedBaseUrl,
  canEditDataType,
  readonly,
  visibleRelations,
  handle,
  addRelation,
  offerGroup,
  childCompatibility,
  groupBaseRef,
  onCreateNewType,
  onEditDraft,
  draftNodesById,
  parentPickScope,
  pinnedGroupTitle,
  lockedDataTypeId,
  expandableEntries = true,
  entryFilter,
  pickGroups,
  hideEmptyPicker,
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
  handle?: Ref<SelectDataTypeInputHandle>;
  /**
   * The relation added entries take. Defaults to the first pick becoming the
   * parent and later picks children.
   */
  addRelation?: AllowedTypeRelation;
  /**
   * Offer the synthetic Group option in this field's pickers — only the
   * drawer's Extends card takes it; everywhere else a pick must reference a
   * real data type
   */
  offerGroup?: boolean;
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
  /**
   * The base type every member of the group shares, recomputed as
   * membership changes — shown on the Group row as a read-only annotation,
   * absent when the members' primitives disagree
   */
  groupBaseRef?: VersionedUrl | null;
  /**
   * Offer a "Create a new type" action closing the add picker's options,
   * calling this instead of staging an entry when picked — with the typed
   * search text as the new type's starting name
   */
  onCreateNewType?: (typedName: string) => void;
  /**
   * Reopens a staged draft's authoring drawer — only drafts are editable in
   * place, since nothing is committed yet
   */
  onEditDraft?: (dataTypeId: VersionedUrl) => void;
  /**
   * Display nodes for staged drafts of types not yet in the graph — their
   * entry rows render from these, without a link, marked as new
   */
  draftNodesById?: ReadonlyMap<VersionedUrl, DataTypeTreeNode>;
  /**
   * Limits parent ("extends") picks to this primitive's root and its
   * descendants — e.g. a type authored for a number group stays a number
   */
  parentPickScope?: ConstraintPrimitive;
  /**
   * The group a new member will extend automatically — shown pinned and
   * uneditable above the entries and the picker
   */
  pinnedGroupTitle?: string;
  /** An entry that can't be removed — the type this one was created to extend */
  lockedDataTypeId?: VersionedUrl;
  /**
   * Whether abstract entries grow a chevron expanding their child types as
   * nested rows
   */
  expandableEntries?: boolean;
  /**
   * Shows only the reference entries this returns true for — lets two
   * instances split one entry list into sections; edits still act on the
   * full value. Synthetic (list, group) entries are unaffected.
   */
  entryFilter?: (dataTypeId: VersionedUrl) => boolean;
  /** The add picker offers abstract (group) types instead of the full tree */
  pickGroups?: boolean;
  /**
   * With no entries at all, render nothing instead of the first-pick
   * combobox — for sections whose adds only come from their header action
   */
  hideEmptyPicker?: boolean;
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

  const tree = useMemo(() => {
    if (!latestDataTypes) {
      return null;
    }
    // Archived types can't be picked: the graph refuses them as parents at
    // save time. Existing references to them still display — resolveNode
    // falls back to a synthesized standalone node for types not in the tree.
    const liveLatestDataTypes = Object.fromEntries(
      Object.entries(latestDataTypes).filter(([, dataType]) =>
        isLiveDataType(dataType),
      ),
    );
    return buildDataTypeTree({
      latestDataTypes: liveLatestDataTypes,
      excludedBaseUrl,
    });
  }, [latestDataTypes, excludedBaseUrl]);

  const pickerTree = useMemo(
    () =>
      tree && offerGroup
        ? {
            roots: [...tree.roots, groupPseudoNode],
            nodeById: new Map(tree.nodeById).set(
              groupPseudoDataTypeId,
              groupPseudoNode,
            ),
            selectableCount: tree.selectableCount + 1,
          }
        : tree,
    [tree, offerGroup],
  );

  // The membership picker: a flat list of the live abstract (group) types —
  // their place in the type tree is immaterial to joining them
  const groupsPickerTree = useMemo((): DataTypeTree | null => {
    if (!pickGroups || !latestDataTypes) {
      return null;
    }
    const roots = Object.values(latestDataTypes)
      .filter(
        (dataType) =>
          isLiveDataType(dataType) &&
          dataType.schema.abstract === true &&
          dataType.metadata.recordId.baseUrl !== excludedBaseUrl,
      )
      .map((dataType): DataTypeTreeNode => {
        const { schema } = dataType;
        return {
          $id: schema.$id,
          abstract: true,
          baseUrl: dataType.metadata.recordId.baseUrl,
          children: [],
          description: schema.description,
          directParents: [],
          label: schema.label ?? {},
          title: schema.title,
          type: "anyOf" in schema ? schema.anyOf[0].type : schema.type,
          version: componentsFromVersionedUrl(schema.$id).version,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    return {
      roots,
      nodeById: new Map(roots.map((node) => [node.$id, node])),
      selectableCount: roots.length,
    };
  }, [pickGroups, latestDataTypes, excludedBaseUrl]);

  if (!tree || !pickerTree) {
    return null;
  }

  const resolveNode = (dataTypeId: VersionedUrl): DataTypeTreeNode | null => {
    if (dataTypeId === groupPseudoDataTypeId) {
      return groupPseudoNode;
    }

    const draftNode = draftNodesById?.get(dataTypeId);
    if (draftNode) {
      return draftNode;
    }

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
    entry.relation === "list"
      ? listDataTypeId
      : entry.relation === "group"
        ? groupPseudoDataTypeId
        : entry.dataTypeId;

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

    // A staged draft exists only in this drawer — its node carries the
    // primitive the compatibility checks and picker scoping need
    const draftNode = draftNodesById?.get(dataTypeId);
    if (draftNode) {
      return (
        primitiveRootTypes.find((rootType) => rootType.type === draftNode.type)
          ?.type ?? null
      );
    }

    return (
      primitiveRootTypeByBaseUrl.get(extractBaseUrl(dataTypeId))?.type ?? null
    );
  };

  /**
   * The tree a member ("child") pick chooses from: once other members fix the
   * value category, only that primitive root's subtree is offered — the root
   * layer drops away. With no other members (the first pick, or replacing the
   * sole member) the category is still open, so the full tree stays.
   */
  const pickerTreeFor = ({
    pickRelation,
    editedIndex,
  }: {
    pickRelation: AllowedTypeRelation;
    editedIndex?: number;
  }): DataTypeTree => {
    if (pickRelation !== "child") {
      if (parentPickScope) {
        const rootBaseUrl = primitiveRootTypes.find(
          (rootType) => rootType.type === parentPickScope,
        )?.baseUrl;
        const rootNode = rootBaseUrl
          ? pickerTree.roots.find((root) => root.baseUrl === rootBaseUrl)
          : undefined;

        if (rootNode) {
          // The category root itself and everything beneath it, with the
          // Group pseudo option kept on offer
          const groupNode = pickerTree.nodeById.get(groupPseudoDataTypeId);
          const roots = [rootNode, ...(groupNode ? [groupNode] : [])];
          const nodeById = new Map<VersionedUrl, DataTypeTreeNode>();
          const collect = (node: DataTypeTreeNode) => {
            if (!nodeById.has(node.$id)) {
              nodeById.set(node.$id, node);
            }
            for (const child of node.children) {
              collect(child);
            }
          };
          for (const root of roots) {
            collect(root);
          }
          return {
            roots,
            nodeById,
            selectableCount: nodeById.size - (groupNode ? 1 : 0),
          };
        }
      }
      return pickerTree;
    }

    const otherMembers = value.filter(
      (entry, index): entry is ReferenceEntry =>
        index !== editedIndex && entry.relation === "child",
    );
    if (otherMembers.length === 0) {
      return pickerTree;
    }

    const primitive = sharedParentPrimitive({
      parentDataTypeIds: otherMembers.map((entry) => entry.dataTypeId),
      resolvePrimitive,
    });
    const rootBaseUrl = primitiveRootTypes.find(
      (rootType) => rootType.type === primitive,
    )?.baseUrl;

    return rootBaseUrl ? scopeTreeToRoot(pickerTree, rootBaseUrl) : pickerTree;
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
      // An action, not a type reference — never disabled by combination rules
      if (node.$id === createNewPseudoDataTypeId) {
        return null;
      }

      // A group stands alone: it extends nothing, and its members live in
      // their own field — so it only combines with staged member entries
      if (node.$id === groupPseudoDataTypeId) {
        return value.some(
          (entry, index) => index !== editedIndex && entry.relation !== "child",
        )
          ? "Can't combine with other types"
          : null;
      }

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
          "dataTypeId" in entry &&
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
      dataTypeId === groupPseudoDataTypeId
        ? { relation: "group" }
        : extractBaseUrl(dataTypeId) === listDataTypeBaseUrl
          ? { relation: "list", config: defaultListConfig() }
          : { dataTypeId, relation: addPickRelation };

    onChange([...value, entry]);
    setActivePicker(null);
  };

  const pinnedGroupRow = pinnedGroupTitle ? (
    <Box
      sx={{
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        gap: 1,
        padding: "6px 12px",
        marginBottom: 1,
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
        <Icon name="layer" size="sm" />
      </Box>
      <Typography
        component="span"
        sx={{
          fontSize: 14,
          fontWeight: 500,
          color: ({ palette }) => palette.gray[90],
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {pinnedGroupTitle}
      </Typography>
    </Box>
  ) : null;

  if (value.length === 0) {
    if (readonly) {
      return null;
    }

    if (hideEmptyPicker) {
      return (
        <Box data-allowed-types-picker ref={containerRef}>
          {pinnedGroupRow}
          {activePicker?.kind === "add" ? (
            <DataTypePicker
              tree={
                (pickGroups ? groupsPickerTree : null) ??
                pickerTreeFor({ pickRelation: addPickRelation })
              }
              value={null}
              onPick={handleAdd}
              getDisabledReason={makeGetDisabledReason({
                requireEditable: false,
                pickRelation: addPickRelation,
              })}
              autoFocus
            />
          ) : null}
        </Box>
      );
    }

    return (
      <Box data-allowed-types-picker ref={containerRef}>
        {pinnedGroupRow}
        <DataTypePicker
          tree={
            (pickGroups ? groupsPickerTree : null) ??
            pickerTreeFor({ pickRelation: addPickRelation })
          }
          value={null}
          onPick={handleAdd}
          onCreateNew={
            onCreateNewType
              ? (typedName) => {
                  setActivePicker(null);
                  onCreateNewType(typedName);
                }
              : undefined
          }
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
    )
    // The universal Value root is plumbing every type ultimately extends,
    // not an inheritance the user works with — kept in the staged entries so
    // saves preserve it, never displayed
    .filter(
      ({ entry }) =>
        entry.relation !== "parent" ||
        extractBaseUrl(entry.dataTypeId) !==
          blockProtocolDataTypes.value.dataTypeBaseUrl,
    )
    .filter(
      ({ entry }) =>
        !entryFilter ||
        !("dataTypeId" in entry) ||
        entryFilter(entry.dataTypeId),
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
              version={
                isBaseDataTypeBaseUrl(child.baseUrl)
                  ? undefined
                  : String(child.version)
              }
              onOpen={() =>
                pushToSlideStack({ kind: "dataType", itemId: child.$id })
              }
            />
          </Box>
          {isExpanded ? renderChildRows(child, path, depth + 1) : null}
        </Fragment>
      );
    });

  const anyEntryExpandable =
    expandableEntries &&
    visibleEntries.some(({ entry }) => {
      if (!("dataTypeId" in entry)) {
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
      {pinnedGroupRow}
      {visibleEntries.length > 0 ? (
        <Box
          sx={{
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            borderRadius: "10px",
          }}
        >
          {visibleEntries.map(({ entry, index }, ordinal) => {
            const isList = entry.relation === "list";
            const isGroup = entry.relation === "group";
            // The length in a list key remounts its editor when entries are
            // added or removed: a surviving index would otherwise inherit a
            // removed sibling's in-progress constraint state
            const entryKey = isList
              ? `list-${index}-of-${value.length}`
              : isGroup
                ? "group"
                : entry.dataTypeId;
            const node = resolveNode(entryDataTypeId(entry));

            // Removing a child entry republishes that type, so it needs
            // permission on it; other relations only change the edited type —
            // except ungrouping, which detaches (republishes) every member
            const canModify =
              entry.relation === "child"
                ? canEditDataType(entry.dataTypeId)
                : entry.relation === "group"
                  ? value.every(
                      (other) =>
                        other.relation !== "child" ||
                        canEditDataType(other.dataTypeId),
                    )
                  : true;

            const entryPath = `entry-${index}:${node?.$id ?? ""}`;
            const expandable =
              expandableEntries &&
              !isList &&
              !!node &&
              node.abstract &&
              node.children.length > 0;
            const isExpanded = expandable && expandedPaths.has(entryPath);

            const groupBaseNode =
              isGroup && groupBaseRef ? resolveNode(groupBaseRef) : null;

            const isDraft = !!node && !!draftNodesById?.has(node.$id);
            // The type this one was created to extend is not removable —
            // the new type exists to extend it
            const isLocked =
              "dataTypeId" in entry && entry.dataTypeId === lockedDataTypeId;

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
                      reason={isDraft ? "New — created on save" : undefined}
                      linkedDataTypeId={
                        "dataTypeId" in entry ? entry.dataTypeId : undefined
                      }
                      version={
                        !isList &&
                        !isGroup &&
                        "dataTypeId" in entry &&
                        !isBaseDataTypeBaseUrl(extractBaseUrl(entry.dataTypeId))
                          ? String(
                              componentsFromVersionedUrl(entry.dataTypeId)
                                .version,
                            )
                          : undefined
                      }
                      // List and group rows are inline configuration, not
                      // type references; a draft has no page to open yet.
                      // The entry's own id opens the referenced version.
                      onOpen={
                        isList || isGroup || isDraft || !("dataTypeId" in entry)
                          ? undefined
                          : () =>
                              pushToSlideStack({
                                kind: "dataType",
                                itemId: entry.dataTypeId,
                              })
                      }
                    />
                  ) : (
                    <Typography component="span" sx={{ fontSize: 14, flex: 1 }}>
                      {isList ? "List" : isGroup ? "Group" : entry.dataTypeId}
                    </Typography>
                  )}
                  {groupBaseNode ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        maxWidth: "50%",
                        flexShrink: 0,
                        minWidth: 0,
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 13,
                          marginTop: "-0.5px",
                          color: ({ palette }) => palette.gray[70],
                          flexShrink: 0,
                        }}
                      >
                        extends
                      </Typography>
                      {/* The width cap must pass through the tooltip's
                          trigger span to reach the chip */}
                      <Box
                        sx={{
                          display: "flex",
                          minWidth: 0,
                          "& > span": {
                            display: "flex",
                            minWidth: 0,
                            maxWidth: "100%",
                          },
                          "& > span > *": { minWidth: 0 },
                        }}
                      >
                        <Tooltip content="The closest type every member shares — updated automatically as members change">
                          <Chip size="md" variant="soft" color="grey">
                            {/* Line-box-sized flex wrapper centres the icon in
                                the pill; the icon's own baseline-relative
                                vertical-align sits it visibly low */}
                            <Box
                              component="span"
                              sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                height: "1lh",
                                verticalAlign: "top",
                              }}
                            >
                              <Icon
                                name={getDataTypeIconName(groupBaseNode)}
                                size="xxs"
                              />
                            </Box>{" "}
                            {groupBaseNode.title}
                          </Chip>
                        </Tooltip>
                      </Box>
                    </Box>
                  ) : null}
                  {readonly || isLocked ? null : (
                    // Changing a pick is remove-then-add — only an uncommitted
                    // draft reopens for editing, since nothing is saved yet
                    <Box sx={{ display: "flex", gap: 0.25, flexShrink: 0 }}>
                      {node && isDraft && onEditDraft ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          iconName="pencil"
                          tooltip="Edit new type"
                          onClick={() => onEditDraft(node.$id)}
                        />
                      ) : null}
                      <Button
                        variant="ghost"
                        size="xs"
                        iconName="close"
                        tooltip={
                          canModify
                            ? "Remove type"
                            : isGroup
                              ? "Ungrouping republishes every member — you lack permission on some"
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
                  <ExtendsListItem
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
            tree={
              (pickGroups ? groupsPickerTree : null) ??
              pickerTreeFor({ pickRelation: addPickRelation })
            }
            value={null}
            onPick={handleAdd}
            onCreateNew={
              onCreateNewType
                ? (typedName) => {
                    setActivePicker(null);
                    onCreateNewType(typedName);
                  }
                : undefined
            }
            getDisabledReason={makeGetDisabledReason({
              // Extending a type doesn't modify it; becoming its parent does
              requireEditable: addPickRelation === "child",
              pickRelation: addPickRelation,
            })}
            autoFocus
          />
        </Box>
      ) : null}
    </Box>
  );
};
