import type { DataType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";
import { Box } from "@mui/material";

export type DataTypeForSelector = {
  $id: VersionedUrl;
  abstract: boolean;
  children: DataTypeForSelector[];
  description: string;
  directParents: VersionedUrl[];
  title: string;
};

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => {
  return "$id" in dataType;
};

/**
 * Build a tree of data types that can be selected by the user, rooted at those data types
 * among targetDataTypes which do not have any parents in targetDataTypes,
 * i.e. rooted at the types which have no selectable parents.
 *
 * Data types may appear in multiple locations in the tree if they have multiple parents.
 */
export const buildDataTypeTreesForSelector = <
  T extends ClosedDataTypeDefinition | DataType,
>({
  targetDataTypes,
  dataTypePool,
}: {
  /**
   * The data types that the user is allowed to select
   * – does not need to include children, but they should appear in the dataTypePool.
   */
  targetDataTypes: T[];
  /**
   * All data types that are available for building the trees from.
   * This MUST include targetDataTypes and any children of targetDataTypes to allow them to be included in the resulting tree.
   * It MAY include other data types which are not selectable (e.g. parents of targetDataTypes, or unrelated types).
   * Unrelated types will not be included in the resulting trees.
   */
  dataTypePool: T[];
}): DataTypeForSelector[] => {
  const roots: DataTypeForSelector[] = [];

  const dataTypeMap = new Map<VersionedUrl, DataTypeForSelector>();

  for (const dataType of dataTypePool) {
    const schema = isDataType(dataType) ? dataType : dataType.schema;
    const directParents = isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents;

    const transformedDataType = {
      $id: schema.$id,
      abstract: !!schema.abstract,
      children: [],
      description: schema.description,
      directParents,
      title: schema.title,
    };

    dataTypeMap.set(transformedDataType.$id, transformedDataType);
  }

  for (const dataType of targetDataTypes) {
    const dataTypeId = isDataType(dataType)
      ? dataType.$id
      : dataType.schema.$id;

    const dataTypeWithChildren = dataTypeMap.get(dataTypeId);
    if (!dataTypeWithChildren) {
      throw new Error(
        `Expected to find target data type with id ${dataTypeId} in pool`,
      );
    }

    let parentAppearsInOptions = false;

    for (const parent of dataTypeWithChildren.directParents) {
      const parentDataType = dataTypeMap.get(parent);

      if (parentDataType) {
        parentDataType.children.push(dataTypeWithChildren);
        parentAppearsInOptions = true;
      }
    }

    if (!parentAppearsInOptions) {
      /**
       * The data type may:
       * 1. Have no parents, OR
       * 2. Have parents which are neither in targetDataTypes nor are a child of a target (and are therefore not valid options)
       *
       * Either way, this data type will appear as the root of a tree.
       */
      roots.push(dataTypeWithChildren);
    }
  }

  return roots;
};

export type DataTypeSelectorProps = {
  dataTypes: DataTypeForSelector[];
  onSelect: (dataTypeId: VersionedUrl) => void;
  selectedDataTypeId: VersionedUrl;
};

export const DataTypeSelector = (props: DataTypeSelectorProps) => {
  const { dataTypes, onSelect, selectedDataTypeId } = props;

  console.log(dataTypes);
  return (
    <>
      {dataTypes.map((dataType) => (
        <Box key={dataType.$id}>
          <Box>
            {dataType.$id}
            {dataType.directParents.join(", ")}
          </Box>
        </Box>
      ))}
    </>
  );
};
