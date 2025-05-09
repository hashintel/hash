import type {
  BaseUrl,
  DataType,
  OntologyTypeVersion,
  StringConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
} from "@blockprotocol/type-system";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing if this package to be used from npm
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing if this package to be used from npm
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import {
  Box,
  outlinedInputClasses,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { MouseEventHandler, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getIconForDataType } from "./data-type-selector/icons";
import { FontAwesomeIcon } from "./fontawesome-icon";
import { IconButton } from "./icon-button";
import { CaretDownSolidIcon } from "./icon-caret-down-solid";
import { CheckIcon } from "./icon-check";

export {
  getIconForDataType,
  identifierTypeTitles,
  measurementTypeTitles,
} from "./data-type-selector/icons";

export type DataTypeForSelector = {
  $id: VersionedUrl;
  abstract: boolean;
  baseUrl: BaseUrl;
  children: DataTypeForSelector[];
  description: string;
  directParents: VersionedUrl[];
  format?: StringConstraints["format"];
  label: DataType["label"];
  type: string;
  title: string;
  version: OntologyTypeVersion;
};

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => {
  return "$id" in dataType;
};

const inputHeight = 48;
const hintHeight = 36;

/**
 * Build a tree rooted at the provided data type, with each node containing the information needed for the selector.
 *
 * Some callers will have the 'closed' data type (with all constraints resolved), others only the underlying schema,
 * without having its parents' constraints merged in.
 *
 * We don't care about the closed schema for this purpose because the selector doesn't care about value constraints,
 * but it's the structure that some callers may already have.
 */
const transformDataTypeForSelector = <
  T extends DataType | ClosedDataTypeDefinition,
>(
  dataType: T,
  directChildrenByDataTypeId: Record<VersionedUrl, T[]>,
  allChildren: VersionedUrl[] = [],
): {
  allChildren: VersionedUrl[];
  transformedDataType: DataTypeForSelector;
} => {
  const schema = isDataType(dataType) ? dataType : dataType.schema;
  const { $id } = schema;

  const children = directChildrenByDataTypeId[$id] ?? [];
  const transformedChildren: DataTypeForSelector[] = [];

  /**
   * We need to track all descendants of the data type, so that {@link buildDataTypeTreesForSelector}
   * can remove any types as roots of a tree where they appear lower down another tree.
   */
  allChildren.push(
    ...children.map((child) =>
      isDataType(child) ? child.$id : child.schema.$id,
    ),
  );

  for (const child of children) {
    const { transformedDataType } = transformDataTypeForSelector(
      child,
      directChildrenByDataTypeId,
      allChildren,
    );
    transformedChildren.push(transformedDataType);
  }

  let format;
  let type;

  if (isDataType(dataType)) {
    const firstSchema = "anyOf" in dataType ? dataType.anyOf[0] : dataType;
    type = firstSchema.type;
    format = "format" in firstSchema ? firstSchema.format : undefined;
  } else {
    const mergedSchema = getMergedDataTypeSchema(dataType.schema);

    const firstSchema =
      "anyOf" in mergedSchema ? mergedSchema.anyOf[0]! : mergedSchema;

    type = firstSchema.type;
    format = "format" in firstSchema ? firstSchema.format : undefined;
  }

  const { baseUrl, version } = componentsFromVersionedUrl($id);

  const transformedDataType = {
    $id,
    baseUrl,
    abstract: !!schema.abstract,
    children: transformedChildren.sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    description: schema.description,
    directParents: isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents,
    format,
    label: schema.label,
    title: schema.title,
    type,
    version,
  };

  return {
    allChildren,
    transformedDataType,
  };
};

/**
 * Build trees of data types that can be selected by the user, rooted at those data types
 * among targetDataTypes which do not have any parents in targetDataTypes,
 * i.e. rooted at the types which have no selectable parents.
 *
 * Data types may appear in multiple locations in the tree if they have multiple selectable parents.
 * This will only happen if a user builds a type with multiple expected values,
 * and one of the values is a descendant of another one.
 *
 * The data type pool must include all children of the targetDataTypes, which can be fetched from the API via one of:
 * - fetching all data types:
 *     e.g. in the context of the type editor, where all types are selectable)
 * - making a query for an entityType with the 'resolvedWithDataTypeChildren' resolution method
 *     e.g. when selecting a value valid for specific entity types, and having the API resolve the valid data types
 */
export const buildDataTypeTreesForSelector = <
  T extends ClosedDataTypeDefinition | DataType,
>({
  targetDataTypes,
  dataTypePoolById,
}: {
  /**
   * The data types that the user is allowed to select
   * – does not need to include children, but they should appear in the dataTypePool.
   */
  targetDataTypes: T[];
  /**
   * All data types that are available for building the trees from.
   * This MUST include targetDataTypes and any children of targetDataTypes to allow them to be included in the
   * resulting tree. It MAY include other data types which are not selectable (e.g. parents of targetDataTypes, or
   * unrelated types). Unrelated types will not be included in the resulting trees.
   */
  dataTypePoolById: Record<VersionedUrl, T>;
}): DataTypeForSelector[] => {
  const directChildrenByDataTypeId: Record<VersionedUrl, T[]> = {};

  /**
   * First, we need to know the children of all data types. Data types store references to their parents, not children.
   * The selectable types are either targets or children of targets.
   */
  for (const dataType of Object.values(dataTypePoolById)) {
    const directParents = isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents;

    for (const parent of directParents) {
      directChildrenByDataTypeId[parent] ??= [];

      const parentDataType = dataTypePoolById[parent];

      if (parentDataType) {
        /**
         * If the parentDataType is not in the pool, it is not a selectable parent.
         * The caller is responsible for ensuring that the pool contains all selectable data types,
         * via one of the methods described in the function's JSDoc.
         */
        directChildrenByDataTypeId[parent].push(dataType);
      }
    }
  }

  const rootsById: Record<VersionedUrl, DataTypeForSelector> = {};

  const dataTypesBelowRoots: VersionedUrl[] = [];

  /**
   * Build a tree for each target data type.
   */
  for (const dataType of targetDataTypes) {
    const { allChildren, transformedDataType } = transformDataTypeForSelector(
      dataType,
      directChildrenByDataTypeId,
    );

    if (
      /**
       * There's no point adding abstract types with no children, because they cannot be selected.
       */
      !transformedDataType.abstract ||
      transformedDataType.children.length > 0
    ) {
      rootsById[transformedDataType.$id] = transformedDataType;
      dataTypesBelowRoots.push(...allChildren);
    }
  }

  /**
   * Finally, remove any trees rooted at a target data type which appears as the child of another target.
   */
  for (const dataTypeId of dataTypesBelowRoots) {
    delete rootsById[dataTypeId];
  }

  return Object.values(rootsById);
};

const DataTypeLabel = (props: {
  dataType: DataTypeForSelector;
  isEarlierVersion: boolean;
  selected: boolean;
}) => {
  const { dataType, selected, isEarlierVersion } = props;

  const labelParts: string[] = [];
  if (dataType.label?.left) {
    labelParts.push(dataType.label.left);
  }
  if (dataType.label?.right) {
    labelParts.push(dataType.label.right);
  }

  const unitLabel = labelParts.length ? labelParts.join(" / ") : undefined;

  const icon = getIconForDataType(dataType);

  return (
    <Tooltip title={dataType.description} placement="left">
      <Stack direction="row" alignItems="center">
        <FontAwesomeIcon
          icon={{ icon }}
          sx={{
            fill: ({ palette }) =>
              selected ? palette.blue[60] : palette.gray[90],
            mr: 1,
          }}
        />
        <Typography
          variant="smallTextParagraphs"
          sx={({ palette }) => ({ color: palette.gray[90], fontSize: 14 })}
        >
          {dataType.title}
        </Typography>
        {unitLabel && (
          <Typography
            sx={({ palette }) => ({
              fontSize: 12,
              color: palette.gray[50],
              ml: 1.5,
            })}
          >
            {unitLabel}
          </Typography>
        )}
        {isEarlierVersion && (
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[50],
              ml: 1,
              fontSize: 13,
            })}
          >
            (Old version)
          </Typography>
        )}
      </Stack>
    </Tooltip>
  );
};

const DataTypeFlatView = (props: {
  allowSelectingAbstractTypes?: boolean;
  dataType: DataTypeForSelector;
  latestVersionByBaseUrl: Record<BaseUrl, OntologyTypeVersion>;
  onSelect: (dataTypeId: VersionedUrl) => void;
  selectedDataTypeIds?: VersionedUrl[];
}) => {
  const {
    allowSelectingAbstractTypes,
    dataType,
    latestVersionByBaseUrl,
    onSelect,
    selectedDataTypeIds,
  } = props;

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDataTypeIds?.includes(dataType.$id)) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selectedDataTypeIds, dataType.$id]);

  const { baseUrl, version } = dataType;

  const latestVersion = latestVersionByBaseUrl[baseUrl];

  if (!latestVersion) {
    throw new Error(`No latest version found for baseUrl: ${baseUrl}`);
  }

  const selected = !!selectedDataTypeIds?.includes(dataType.$id);

  const isEarlierVersion =
    compareOntologyTypeVersions(version, latestVersion) < 0;

  if (!selected && isEarlierVersion) {
    return null;
  }

  return (
    <Box
      component="button"
      ref={ref}
      onClick={
        dataType.abstract && !allowSelectingAbstractTypes
          ? undefined
          : (event) => {
              event.stopPropagation();
              onSelect(dataType.$id);
            }
      }
      sx={({ palette, transitions }) => ({
        cursor: "pointer",
        px: 2.5,
        py: 1.5,
        background: selected ? palette.blue[20] : palette.common.white,
        borderRadius: 1,
        border: `1px solid ${selected ? palette.blue[30] : palette.gray[30]}`,
        "&:hover": {
          background: selected
            ? palette.blue[30]
            : !!allowSelectingAbstractTypes || !dataType.abstract
              ? palette.gray[10]
              : undefined,
        },
        transition: transitions.create("background"),
      })}
    >
      <DataTypeLabel
        {...props}
        selected={selected}
        isEarlierVersion={isEarlierVersion}
      />
    </Box>
  );
};

const defaultActionClassName = "data-type-selector-default-action-button";

const DataTypeTreeView = (props: {
  allowSelectingAbstractTypes?: boolean;
  dataType: DataTypeForSelector;
  depth?: number;
  isOnlyRoot?: boolean;
  latestVersionByBaseUrl: Record<BaseUrl, OntologyTypeVersion>;
  selectedDataTypeIds?: VersionedUrl[];
  onSelect: (dataTypeId: VersionedUrl) => void;
}) => {
  const {
    allowSelectingAbstractTypes,
    dataType,
    depth = 0,
    latestVersionByBaseUrl,
    onSelect,
    selectedDataTypeIds,
  } = props;

  const selected = !!selectedDataTypeIds?.includes(dataType.$id);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selected]);

  const { abstract, children, $id } = dataType;

  const [expanded, setExpanded] = useState(() => {
    const stack = [...children];
    while (stack.length > 0) {
      const current = stack.pop()!;

      if (selectedDataTypeIds?.includes(current.$id)) {
        return true;
      }

      stack.push(...current.children);
    }
  });

  const { baseUrl, version } = dataType;

  const latestVersion = latestVersionByBaseUrl[baseUrl];

  if (!latestVersion) {
    throw new Error(`No latest version found for baseUrl: ${baseUrl}`);
  }

  const isEarlierVersion =
    compareOntologyTypeVersions(version, latestVersion) < 0;

  if (!selected && isEarlierVersion) {
    return null;
  }

  const defaultAction: MouseEventHandler<HTMLDivElement> =
    abstract && !allowSelectingAbstractTypes
      ? (event) => {
          event.stopPropagation();
          setExpanded(!expanded);
        }
      : (event) => {
          event.stopPropagation();
          onSelect($id);
        };

  return (
    <>
      <Stack
        ref={ref}
        tabIndex={0}
        direction="row"
        justifyContent="space-between"
        onClick={defaultAction}
        sx={({ palette, transitions }) => ({
          cursor: "pointer",
          ml: depth * 3,
          px: 2.5,
          py: 1,
          background: selected
            ? palette.blue[20]
            : dataType.abstract
              ? palette.gray[20]
              : undefined,
          borderRadius: 1,
          border: `1px solid ${selected ? palette.blue[30] : palette.gray[30]}`,
          [`&:hover svg.${defaultActionClassName}`]: {
            fill: palette.blue[50],
          },
          "&:hover": {
            background: selected
              ? palette.blue[30]
              : !!allowSelectingAbstractTypes || !abstract
                ? palette.gray[10]
                : undefined,
          },
          transition: transitions.create("background"),
        })}
      >
        <DataTypeLabel
          {...props}
          selected={selected}
          isEarlierVersion={isEarlierVersion}
        />
        <Stack direction="row" gap={0}>
          {children.length > 0 && (
            <IconButton
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
              rounded
              sx={({ palette, transitions }) => ({
                fill: expanded ? palette.blue[70] : palette.gray[50],
                transform: expanded ? "none" : "rotate(-90deg)",
                transition: transitions.create(["transform", "fill"]),
                p: 0.7,
                "& svg": { fontSize: 12 },
              })}
            >
              <CaretDownSolidIcon
                className={
                  abstract && !allowSelectingAbstractTypes
                    ? defaultActionClassName
                    : undefined
                }
              />
            </IconButton>
          )}
          {(!abstract || allowSelectingAbstractTypes) && (
            <IconButton
              onClick={(event) => {
                event.stopPropagation();
                onSelect($id);
              }}
              size="small"
              rounded
              sx={({ palette }) => ({
                p: 0.7,
                "& svg": {
                  fontSize: 14,
                  fill: selected ? palette.blue[60] : palette.gray[50],
                },
              })}
            >
              <CheckIcon className={defaultActionClassName} />
            </IconButton>
          )}
        </Stack>
      </Stack>
      {expanded &&
        children.map((child) => {
          return (
            <DataTypeTreeView
              allowSelectingAbstractTypes={allowSelectingAbstractTypes}
              key={child.$id}
              dataType={child}
              depth={depth + 1}
              latestVersionByBaseUrl={latestVersionByBaseUrl}
              onSelect={onSelect}
              selectedDataTypeIds={selectedDataTypeIds}
            />
          );
        })}
    </>
  );
};

export type DataTypeSelectorProps = {
  additionalMenuContent?: {
    element: ReactNode;
    height: number;
  };
  allowSelectingAbstractTypes?: boolean;
  autoFocus?: boolean;
  dataTypes: DataTypeForSelector[];
  /**
   * If the parent needs to listen for clicks outside the menu, it should provide a ref that will be attached to the popover.
   */
  externallyProvidedPopoverRef?: RefObject<HTMLDivElement | null>;
  /**
   * If the parent is providing its own search input, this object is required,
   */
  externalSearchInput?: {
    /**
     * Whether the search input is focused (determines whether the menu is open)
     */
    focused: boolean;
    /**
     * The ref to the search input (determines the width of the menu and the element it is anchored to)
     */
    inputRef: RefObject<HTMLInputElement | HTMLDivElement | null>;
    /**
     * The search text (needed to filter the data types)
     */
    searchText: string;
  };
  hideHint?: boolean;
  placeholder?: string;
  onSelect: (dataTypeId: VersionedUrl) => void;
  selectedDataTypeIds?: VersionedUrl[];
};

const maxMenuHeight = 300;

export const DataTypeSelector = (props: DataTypeSelectorProps) => {
  const {
    additionalMenuContent,
    allowSelectingAbstractTypes,
    autoFocus = true,
    dataTypes,
    externallyProvidedPopoverRef,
    externalSearchInput,
    hideHint,
    onSelect,
    placeholder,
    selectedDataTypeIds,
  } = props;

  const [textFieldFocused, setTextFieldFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const textFieldRef = useRef<HTMLDivElement>(null);

  const [localSearchText, setLocalSearchText] = useState("");

  const searchText = externalSearchInput?.searchText ?? localSearchText;

  const { flattenedDataTypes, latestVersionByBaseUrl } = useMemo(() => {
    const flattened: DataTypeForSelector[] = [];

    const stack = [...dataTypes];

    const seenDataTypes = new Set<VersionedUrl>();
    const latestByBaseUrl: Record<BaseUrl, OntologyTypeVersion> = {};

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (seenDataTypes.has(current.$id)) {
        continue;
      }

      const { baseUrl, version } = current;

      const currentLatest = latestByBaseUrl[baseUrl];

      if (
        !currentLatest ||
        compareOntologyTypeVersions(currentLatest, version) < 0
      ) {
        latestByBaseUrl[baseUrl] = version;
      }

      flattened.push(current);

      stack.push(...current.children);

      seenDataTypes.add(current.$id);
    }

    return {
      flattenedDataTypes: flattened,
      latestVersionByBaseUrl: latestByBaseUrl,
    };
  }, [dataTypes]);

  const dataTypesToDisplay = useMemo(() => {
    if (!searchText) {
      return dataTypes;
    }

    return flattenedDataTypes.filter(
      (dataType) =>
        (allowSelectingAbstractTypes || !dataType.abstract) &&
        (dataType.title.toLowerCase().includes(searchText.toLowerCase()) ||
          dataType.label?.left
            ?.toLowerCase()
            .includes(searchText.toLowerCase()) ||
          dataType.label?.right
            ?.toLowerCase()
            .includes(searchText.toLowerCase())),
    );
  }, [allowSelectingAbstractTypes, dataTypes, flattenedDataTypes, searchText]);

  const sortedDataTypes = useMemo(() => {
    return dataTypesToDisplay.sort((a, b) => {
      if (searchText) {
        if (a.title.toLowerCase().startsWith(searchText.toLowerCase())) {
          return -1;
        }
        if (b.title.toLowerCase().startsWith(searchText.toLowerCase())) {
          return 1;
        }
      }

      return a.title.localeCompare(b.title);
    });
  }, [dataTypesToDisplay, searchText]);

  return (
    <Stack ref={containerRef} sx={{ maxHeight: maxMenuHeight }}>
      {externalSearchInput === undefined && (
        <TextField
          autoComplete="off"
          autoFocus={autoFocus}
          value={localSearchText}
          onChange={(event) => setLocalSearchText(event.target.value)}
          onFocus={() => setTextFieldFocused(true)}
          onBlur={(event) => {
            const isMenuClick = popoverRef.current?.contains(
              event.relatedTarget as Node,
            );

            if (!isMenuClick) {
              setTextFieldFocused(false);
            }
          }}
          placeholder={placeholder ?? "Start typing to filter options..."}
          ref={textFieldRef}
          sx={{
            height: inputHeight,
            maxWidth: 500,
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            borderRadius: 1,
            [`.${outlinedInputClasses.root} input`]: {
              fontSize: 14,
            },
            [`.${outlinedInputClasses.notchedOutline}`]: {
              border: "none",
            },
          }}
        />
      )}
      <Popper
        anchorEl={externalSearchInput?.inputRef.current ?? textFieldRef.current}
        open={externalSearchInput?.focused ?? textFieldFocused}
        ref={externallyProvidedPopoverRef ?? popoverRef}
        sx={{
          zIndex: 1300,
        }}
      >
        <Box
          sx={({ palette }) => ({
            background: palette.common.white,
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 1,
            maxHeight: maxMenuHeight,
            width:
              externalSearchInput?.inputRef.current?.clientWidth ??
              textFieldRef.current?.clientWidth,
          })}
        >
          {!hideHint && (
            <Stack direction="row" sx={{ height: hintHeight, px: 2, pt: 1.5 }}>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: ({ palette }) => palette.gray[80],
                  mr: 1,
                  textTransform: "uppercase",
                }}
              >
                Choose data type
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: ({ palette }) => palette.gray[50],
                }}
              >
                How are you representing this value?
              </Typography>
            </Stack>
          )}

          <Stack
            gap={1}
            sx={{
              maxHeight:
                maxMenuHeight -
                (hideHint ? 0 : hintHeight) -
                (additionalMenuContent?.height ?? 0),
              overflowY: sortedDataTypes.length ? "scroll" : undefined,
              px: 2,
              pb: 1.5,
              pt: 1.5,
            }}
          >
            {!sortedDataTypes.length && (
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 14,
                }}
              >
                No options found...
              </Typography>
            )}
            {sortedDataTypes.map((dataType) => {
              if (searchText) {
                return (
                  <DataTypeFlatView
                    allowSelectingAbstractTypes={allowSelectingAbstractTypes}
                    key={dataType.$id}
                    dataType={dataType}
                    latestVersionByBaseUrl={latestVersionByBaseUrl}
                    onSelect={(dataTypeId) => {
                      onSelect(dataTypeId);
                      setTextFieldFocused(false);
                    }}
                    selectedDataTypeIds={selectedDataTypeIds}
                  />
                );
              }

              return (
                <DataTypeTreeView
                  allowSelectingAbstractTypes={allowSelectingAbstractTypes}
                  key={dataType.$id}
                  dataType={dataType}
                  latestVersionByBaseUrl={latestVersionByBaseUrl}
                  isOnlyRoot={dataTypes.length === 1}
                  onSelect={(dataTypeId) => {
                    onSelect(dataTypeId);
                    setTextFieldFocused(false);
                  }}
                  selectedDataTypeIds={selectedDataTypeIds}
                />
              );
            })}
          </Stack>
          {additionalMenuContent?.element}
        </Box>
      </Popper>
    </Stack>
  );
};
