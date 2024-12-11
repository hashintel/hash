import type { DataType, VersionedUrl } from "@blockprotocol/type-system/slim";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing if this package to be used from npm
import type { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";
import { Box, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";

export type DataTypeForSelector = {
  $id: VersionedUrl;
  abstract: boolean;
  children: DataTypeForSelector[];
  description: string;
  directParents: VersionedUrl[];
  label: DataType["label"];
  title: string;
};

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => {
  return "$id" in dataType;
};

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

  const transformedDataType = {
    $id,
    abstract: !!schema.abstract,
    children: transformedChildren,
    description: schema.description,
    directParents: isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents,
    label: schema.label,
    title: schema.title,
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

  const start = new Date();

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
    rootsById[transformedDataType.$id] = transformedDataType;
    dataTypesBelowRoots.push(...allChildren);
  }

  /**
   * Finally, remove any trees rooted at a target data type which appears as the child of another target.
   */
  for (const dataTypeId of dataTypesBelowRoots) {
    delete rootsById[dataTypeId];
  }

  console.log(
    `Took ${new Date().getTime() - start.getTime()}ms to build data type trees`,
  );

  return Object.values(rootsById);
};

const DataTypeLabel = (props: {
  dataType: DataTypeForSelector;
  selected: boolean;
}) => {
  const { dataType } = props;

  const labelParts: string[] = [];
  if (dataType.label?.left) {
    labelParts.push(dataType.label.left);
  }
  if (dataType.label?.right) {
    labelParts.push(dataType.label.right);
  }

  const unitLabel = labelParts.length ? labelParts.join(" / ") : undefined;

  return (
    <Stack>
      {/* @todo icon */}
      <Typography
        variant="smallTextParagraphs"
        sx={({ palette }) => ({ color: palette.gray[90] })}
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
  );
};

const DataTypeFlatView = (props: {
  dataType: DataTypeForSelector;
  selected: boolean;
}) => {
  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.5,
        borderRadius: 1,
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
      }}
    >
      <DataTypeLabel {...props} />
    </Box>
  );
};

export type DataTypeSelectorProps = {
  dataTypes: DataTypeForSelector[];
  onSelect: (dataTypeId: VersionedUrl) => void;
  selectedDataTypeId?: VersionedUrl;
};

export const DataTypeSelector = (props: DataTypeSelectorProps) => {
  const { dataTypes, onSelect, selectedDataTypeId } = props;

  const [searchText, setSearchText] = useState("");

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

  const filteredDataTypes = useMemo(() => {
    if (!searchText) {
      return flattenedDataTypes;
    }

    return flattenedDataTypes.filter((dataType) =>
      dataType.title.toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [flattenedDataTypes, searchText]);

  const sortedDataTypes = useMemo(() => {
    return filteredDataTypes.sort((a, b) => {
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
  }, [filteredDataTypes, searchText]);

  return (
    <Stack sx={{ px: 2, py: 1.5 }}>
      <TextField
        inputProps={{
          disableInjectingGlobalStyles: true,
        }}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder="Start typing to filter options..."
      />
      <Typography variant="smallCaps" mr={1}>
        Choose data type
      </Typography>
      <Typography variant="smallTextLabels">
        How are you representing this value?
      </Typography>

      <Stack gap={1}>
        {sortedDataTypes.map((dataType) => (
          <DataTypeFlatView
            key={dataType.$id}
            dataType={dataType}
            selected={false}
          />
        ))}
      </Stack>
    </Stack>
  );
};
