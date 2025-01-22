import type {
  DataType,
  StringConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing if this package to be used from npm
import type { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing if this package to be used from npm
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import {
  Box,
  outlinedInputClasses,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { MouseEventHandler } from "react";
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
  children: DataTypeForSelector[];
  description: string;
  directParents: VersionedUrl[];
  format?: StringConstraints["format"];
  label: DataType["label"];
  type: string;
  title: string;
};

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => {
  return "$id" in dataType;
};

const defaultMaxHeight = 500;
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

  const transformedDataType = {
    $id,
    abstract: !!schema.abstract,
    children: transformedChildren.sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    description: schema.description,
    directParents: isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents,
    label: schema.label,
    title: schema.title,
    type,
    format,
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
  selected: boolean;
}) => {
  const { dataType, selected } = props;

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
      </Stack>
    </Tooltip>
  );
};

const DataTypeFlatView = (props: {
  allowSelectingAbstractTypes?: boolean;
  dataType: DataTypeForSelector;
  selected: boolean;
  onSelect: (dataTypeId: VersionedUrl) => void;
}) => {
  const { allowSelectingAbstractTypes, dataType, onSelect, selected } = props;

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selected]);

  return (
    <Box
      ref={ref}
      onClick={
        dataType.abstract && !allowSelectingAbstractTypes
          ? undefined
          : () => onSelect(dataType.$id)
      }
      sx={({ palette, transitions }) => ({
        cursor: "pointer",
        px: 2.5,
        py: 1.5,
        background: selected ? palette.blue[20] : undefined,
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
      <DataTypeLabel {...props} />
    </Box>
  );
};

const defaultActionClassName = "data-type-selector-default-action-button";

const DataTypeTreeView = (props: {
  allowSelectingAbstractTypes?: boolean;
  dataType: DataTypeForSelector;
  depth?: number;
  isOnlyRoot?: boolean;
  selectedDataTypeId?: VersionedUrl;
  onSelect: (dataTypeId: VersionedUrl) => void;
}) => {
  const {
    allowSelectingAbstractTypes,
    dataType,
    depth = 0,
    onSelect,
    selectedDataTypeId,
  } = props;

  const selected = dataType.$id === selectedDataTypeId;

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

      if (current.$id === selectedDataTypeId) {
        return true;
      }

      stack.push(...current.children);
    }
  });

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
        <DataTypeLabel {...props} selected={selected} />
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
              onSelect={onSelect}
              selectedDataTypeId={selectedDataTypeId}
            />
          );
        })}
    </>
  );
};

export type DataTypeSelectorProps = {
  allowSelectingAbstractTypes?: boolean;
  dataTypes: DataTypeForSelector[];
  hideHint?: boolean;
  maxHeight?: number;
  onSelect: (dataTypeId: VersionedUrl) => void;
  searchText?: string;
  selectedDataTypeId?: VersionedUrl;
};

export const DataTypeSelector = (props: DataTypeSelectorProps) => {
  const {
    allowSelectingAbstractTypes,
    dataTypes,
    hideHint,
    maxHeight: maxHeightFromProps,
    onSelect,
    searchText: externallyControlledSearchText,
    selectedDataTypeId,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | undefined>();

  useEffect(() => {
    const updateAvailableHeight = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const bottomSpace = windowHeight - rect.top;

      // Add a small buffer (20px) to prevent touching the bottom of the window
      const maxAvailableHeight = bottomSpace - 20;

      setAvailableHeight(
        Math.min(maxHeightFromProps ?? defaultMaxHeight, maxAvailableHeight),
      );
    };

    updateAvailableHeight();
    window.addEventListener("resize", updateAvailableHeight);

    return () => {
      window.removeEventListener("resize", updateAvailableHeight);
    };
  }, [maxHeightFromProps]);

  const maxHeight = !availableHeight ? undefined : availableHeight;

  const [localSearchText, setLocalSearchText] = useState("");

  const searchText = externallyControlledSearchText ?? localSearchText;

  const flattenedDataTypes = useMemo(() => {
    const flattened: DataTypeForSelector[] = [];

    const stack = [...dataTypes];

    const seenDataTypes = new Set<VersionedUrl>();

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (seenDataTypes.has(current.$id)) {
        continue;
      }

      flattened.push(current);

      stack.push(...current.children);

      seenDataTypes.add(current.$id);
    }

    return flattened;
  }, [dataTypes]);

  const dataTypesToDisplay = useMemo(() => {
    if (!searchText) {
      return dataTypes;
    }

    return flattenedDataTypes.filter(
      (dataType) =>
        (allowSelectingAbstractTypes || !dataType.abstract) &&
        dataType.title.toLowerCase().includes(searchText.toLowerCase()),
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
    <Stack ref={containerRef} sx={{ maxHeight: availableHeight }}>
      {externallyControlledSearchText === undefined && (
        <TextField
          autoFocus
          value={localSearchText}
          onChange={(event) => setLocalSearchText(event.target.value)}
          placeholder="Start typing to filter options..."
          sx={{
            borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
            height: inputHeight,
            "*": {
              border: "none",
              boxShadow: "none",
              borderRadius: 0,
            },
            [`.${outlinedInputClasses.root} input`]: {
              fontSize: 14,
            },
          }}
        />
      )}
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
          maxHeight: maxHeight
            ? maxHeight -
              (hideHint ? 0 : hintHeight) -
              (externallyControlledSearchText !== undefined ? 0 : inputHeight)
            : undefined,
          overflowY:
            sortedDataTypes.length && availableHeight ? "scroll" : undefined,
          px: 2,
          pb: 1.5,
          pt: 1.5,
        }}
      >
        {!sortedDataTypes.length && (
          <Typography
            sx={{ color: ({ palette }) => palette.gray[50], fontSize: 14 }}
          >
            No options found...
          </Typography>
        )}
        {sortedDataTypes.map((dataType) => {
          const selected = dataType.$id === selectedDataTypeId;

          if (searchText) {
            return (
              <DataTypeFlatView
                allowSelectingAbstractTypes={allowSelectingAbstractTypes}
                key={dataType.$id}
                dataType={dataType}
                onSelect={onSelect}
                selected={selected}
              />
            );
          }

          return (
            <DataTypeTreeView
              allowSelectingAbstractTypes={allowSelectingAbstractTypes}
              key={dataType.$id}
              dataType={dataType}
              isOnlyRoot={dataTypes.length === 1}
              onSelect={onSelect}
              selectedDataTypeId={selectedDataTypeId}
            />
          );
        })}
      </Stack>
    </Stack>
  );
};
