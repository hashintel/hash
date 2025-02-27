import type { DataType, VersionedUrl } from "@blockprotocol/type-system";
import type { BaseUrl } from "@blockprotocol/type-system/slim";
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
import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { Link } from "../../../shared/ui/link";
import { useDataTypesContext } from "../data-types-context";
import type { DataTypeFormData } from "./data-type-form";

type DataTypeParent = {
  dataType: DataType;
  latestVersion: number;
};

export const DataTypeParentCard = ({
  isReadOnly,
  onlyParent,
  parent,
  onClick,
  onRemove,
}: {
  isReadOnly: boolean;
  onlyParent: boolean;
  parent: DataTypeParent;
  onClick: () => void;
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
      directParentDataTypeIds.map((parentId) => {
        const targetBaseUrl = extractBaseUrl($id);

        if (targetBaseUrl === extractBaseUrl(parentId)) {
          return `${targetBaseUrl}v/${newVersion}` as const;
        }
        return parentId;
      }),
      { shouldDirty: true },
    );
  };

  return (
    <TypeCard
      onClick={onClick}
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
      swappableOnly={onlyParent}
      title={title}
      url={generateLinkParameters($id).href}
      version={extractVersion($id)}
    />
  );
};

export const DataTypesParents = ({
  dataTypeBaseUrl,
  isReadOnly,
  onDataTypeClick,
}: {
  dataTypeBaseUrl: BaseUrl;
  isReadOnly: boolean;
  onDataTypeClick: (dataTypeId: VersionedUrl) => void;
}) => {
  const { dataTypes } = useDataTypesContext();

  const { control, setValue } = useFormContext<DataTypeFormData>();

  const directParentDataTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const parents: DataTypeParent[] | undefined = dataTypes
    ? directParentDataTypeIds.map((parentId) => {
        const parentDataType = dataTypes[parentId];

        if (!parentDataType) {
          throw new Error(`Parent data type not found: ${parentId}`);
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
        .filter(
          (type) =>
            type.schema.allOf?.some(
              ({ $ref }) => $ref === blockProtocolDataTypes.value.dataTypeId,
            ) && type.metadata.recordId.baseUrl !== dataTypeBaseUrl,
        )
        .map((type) => type.schema),
      dataTypePoolById: dataTypesArray.reduce<Record<VersionedUrl, DataType>>(
        (acc, type) => {
          if (type.metadata.recordId.baseUrl === dataTypeBaseUrl) {
            return acc;
          }

          acc[type.schema.$id] = type.schema;
          return acc;
        },
        {},
      ),
    });
  }, [dataTypes, dataTypeBaseUrl]);

  const addParent = (newParentTypeId: VersionedUrl) => {
    const parent = dataTypes?.[newParentTypeId]?.schema;

    if (!parent) {
      throw new Error(`Parent data type not found: ${newParentTypeId}`);
    }

    if (!("type" in parent)) {
      throw new Error(
        `Parent data type does not have a type: ${newParentTypeId}`,
      );
    }

    const parentsWithoutOlderVersion = directParentDataTypeIds.filter(
      (parentId) => {
        const existingParentBaseUrl = extractBaseUrl(parentId);
        const newParentBaseUrl = extractBaseUrl(newParentTypeId);

        return existingParentBaseUrl !== newParentBaseUrl;
      },
    );

    setValue("allOf", [...parentsWithoutOlderVersion, newParentTypeId], {
      shouldDirty: true,
    });
    setValue("constraints.type", parent.type, {
      shouldDirty: true,
    });
  };

  const type = useWatch({
    control,
    name: "constraints.type",
  });

  useEffect(() => {
    const firstParentType = parents?.[0]?.dataType;

    if (
      firstParentType &&
      "type" in firstParentType &&
      type !== firstParentType.type
    ) {
      setValue("constraints.type", firstParentType.type, { shouldDirty: true });
    }
  }, [type, parents, setValue]);

  const removeParent = (parentToRemoveTypeId: VersionedUrl) => {
    setValue(
      "allOf",
      directParentDataTypeIds.filter(
        (parentId) => parentId !== parentToRemoveTypeId,
      ),
      {
        shouldDirty: true,
      },
    );
  };

  if (!parents || !dataTypes) {
    return null;
  }

  if (parents.length === 0) {
    if (isReadOnly) {
      return (
        <Box>
          <Typography variant="h5" mb={2}>
            Extends
          </Typography>
          <Typography variant="smallTextParagraphs">
            This type has no parents.
          </Typography>
        </Box>
      );
    }

    return (
      <Box>
        <Typography variant="h5" mb={2}>
          Extends
        </Typography>
        <Box
          sx={{
            width: 600,
            borderRadius: 2,
            position: "relative",
            zIndex: 3,
          }}
        >
          <Box
            sx={({ palette }) => ({
              background: palette.common.white,
              border: `1px solid ${palette.gray[30]}`,
              borderRadius: 2,
              position: "absolute",
              top: 0,
              left: 0,
              width: 600,
            })}
          >
            <DataTypeSelector
              allowSelectingAbstractTypes
              dataTypes={dataTypeOptions}
              handleScroll
              hideHint
              maxHeight={300}
              onSelect={(newParentTypeId) => {
                addParent(newParentTypeId);
              }}
              selectedDataTypeIds={directParentDataTypeIds}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Extends
      </Typography>
      <Stack direction="row" spacing={2}>
        {parents.map((parent) => {
          return (
            <DataTypeParentCard
              key={parent.dataType.$id}
              isReadOnly={isReadOnly}
              onClick={() => {
                onDataTypeClick(parent.dataType.$id);
              }}
              onlyParent={parents.length === 1}
              parent={parent}
              onRemove={() => {
                removeParent(parent.dataType.$id);
              }}
            />
          );
        })}
      </Stack>
    </Box>
  );
};
