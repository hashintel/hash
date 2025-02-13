import type { DataType, VersionedUrl } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system/slim";
import {
  buildDataTypeTreesForSelector,
  DataTypeSelector,
  TypeCard,
} from "@hashintel/design-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Stack } from "@mui/system";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Link } from "../../../shared/ui/link";
import { useDataTypesContext } from "../data-types-context";
import type { DataTypeFormData } from "./data-type-form";

type DataTypeParent = {
  dataType: DataType;
  latestVersion: number;
};

export const DataTypeParentCard = ({
  isReadOnly,
  parent,
  onRemove,
}: {
  isReadOnly: boolean;
  parent: DataTypeParent;
  onRemove: () => void;
}) => {
  const { dataType, latestVersion } = parent;
  const { $id, title } = dataType;

  const currentVersion = extractVersion($id);
  const newVersion = currentVersion < latestVersion ? latestVersion : undefined;

  const { control, setValue } = useFormContext<DataTypeFormData>();

  const directParentDataTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const upgradeToVersion = () => {
    if (!newVersion) {
      return;
    }

    setValue(
      "allOf",
      directParentDataTypeIds.map(({ $ref }) => {
        const targetBaseUrl = extractBaseUrl($id);

        if (targetBaseUrl === extractBaseUrl($ref)) {
          return { $ref: `${targetBaseUrl}v/${newVersion}` as const };
        }
        return { $ref };
      }),
      { shouldDirty: true },
    );
  };

  return (
    <TypeCard
      onDelete={isReadOnly ? undefined : onRemove}
      isLink={false}
      LinkComponent={Link}
      newVersionConfig={
        !isReadOnly && newVersion
          ? {
              newVersion,
              onUpdateVersion: upgradeToVersion,
            }
          : undefined
      }
      title={title}
      url={$id}
      version={extractVersion($id)}
    />
  );
};

/**
 * @todo
 * 1. Show 'upgrade' button
 */
export const DataTypesParents = ({
  isReadOnly,
}: {
  isReadOnly: boolean;
}) => {
  const { dataTypes } = useDataTypesContext();

  const { control, setValue } = useFormContext<DataTypeFormData>();

  const directParentDataTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const parents: DataTypeParent[] | undefined = dataTypes
    ? directParentDataTypeIds.map(({ $ref }) => {
        const parentDataType = dataTypes[$ref];

        if (!parentDataType) {
          throw new Error(`Parent data type not found: ${$ref}`);
        }

        let latestVersion = parentDataType.metadata.recordId.version;

        for (const dataTypeOption of Object.values(dataTypes)) {
          if (
            dataTypeOption.metadata.recordId.baseUrl ===
              parentDataType.metadata.recordId.baseUrl &&
            dataTypeOption.metadata.recordId.version > latestVersion
          ) {
            latestVersion = dataTypeOption.metadata.recordId.version;
          }
        }

        return { dataType: parentDataType.schema, latestVersion };
      })
    : undefined;

  const dataTypeOptions = useMemo(() => {
    if (!dataTypes) {
      return [];
    }

    const dataTypesArray = Object.values(dataTypes);

    return buildDataTypeTreesForSelector({
      targetDataTypes: dataTypesArray
        .filter((type) =>
          type.schema.allOf?.some(
            ({ $ref }) => $ref === blockProtocolDataTypes.value.dataTypeId,
          ),
        )
        .map((type) => type.schema),
      dataTypePoolById: dataTypesArray.reduce<Record<VersionedUrl, DataType>>(
        (acc, type) => {
          acc[type.schema.$id] = type.schema;
          return acc;
        },
        {},
      ),
    });
  }, [dataTypes]);

  const addParent = (dataTypeId: VersionedUrl) => {
    setValue("allOf", [...directParentDataTypeIds, { $ref: dataTypeId }], {
      shouldDirty: true,
    });
  };

  const removeParent = (dataTypeId: VersionedUrl) => {
    setValue(
      "allOf",
      directParentDataTypeIds.filter(({ $ref }) => $ref !== dataTypeId),
      {
        shouldDirty: true,
      },
    );
  };

  if (!parents || !dataTypes) {
    return null;
  }

  if (parents.length === 0) {
    return (
      <DataTypeSelector
        allowSelectingAbstractTypes
        dataTypes={dataTypeOptions}
        handleScroll
        hideHint
        maxHeight={300}
        onSelect={(dataTypeId) => {
          addParent(dataTypeId);
        }}
      />
    );
  }

  return (
    <Stack direction="row" spacing={2}>
      {parents.map((parent) => {
        return (
          <DataTypeParentCard
            key={parent.dataType.$id}
            isReadOnly={isReadOnly}
            parent={parent}
            onRemove={() => {
              removeParent(parent.dataType.$id);
            }}
          />
        );
      })}
    </Stack>
  );
};
