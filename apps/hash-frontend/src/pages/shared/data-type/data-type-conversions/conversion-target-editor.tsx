import { useQuery } from "@apollo/client";
import type { DataTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  type Conversions,
  type DataType,
  extractBaseUrl,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import { DataTypeSelector } from "@hashintel/design-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import { buildDataTypeTreesForSelector } from "@local/hash-isomorphic-utils/data-types";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { Button } from "../../../../shared/ui/button";
import { useDataTypesContext } from "../../data-types-context";
import type { DataTypeFormData } from "../data-type-form";
import { useInheritedConstraints } from "../shared/use-inherited-constraints";

export const ConversionTargetEditor = ({
  dataType,
}: {
  dataType: DataType;
}) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

  const [selectingConversionTarget, setSelectingConversionTarget] =
    useState(false);

  const { control, setValue } = useFormContext<DataTypeFormData>();

  const directParentDataTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const ownConversions = useWatch({ control, name: "conversions" });

  const inheritedConversions = useInheritedConstraints().conversions;

  useEffect(() => {
    if (Object.keys(inheritedConversions ?? {}).length > 0) {
      /**
       * If we have inherited a conversion, wipe any local ones defined.
       * We currently don't support multiple conversions (frontend limitation only to avoid complexity, can be lifted if needed).
       */
      setValue("conversions", {});
    }
  }, [inheritedConversions, setValue]);

  const addConversionTarget = (dataTypeId: VersionedUrl) => {
    setValue("conversions", {
      [extractBaseUrl(dataTypeId)]: {
        to: { expression: ["/", "self", { const: 1, type: "number" }] },
        from: { expression: ["*", "self", { const: 1, type: "number" }] },
      } satisfies Conversions,
    });
  };

  const [hasCheckedSiblings, setHasCheckedSiblings] = useState(false);

  /**
   * If someone happens to have defined a conversion on a direct child of Number,
   * we don't want to declare it the canonical conversion target for all children of Number.
   */
  const nonNumberParentIds = directParentDataTypeIds.filter(
    (id) =>
      blockProtocolDataTypes.number.dataTypeBaseUrl !== extractBaseUrl(id),
  );

  const { data: siblingDataTypesData } = useQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    variables: {
      constrainsValuesOn: { outgoing: 0 },
      filter: {
        any: nonNumberParentIds.map((id) => ({
          equal: [
            { path: ["inheritsFrom(inheritanceDepth=0)", "*", "versionedUrl"] },
            { parameter: id },
          ],
        })),
      },
      includeArchived: true,
      inheritsFrom: { outgoing: 255 },
      latestOnly: false,
    },
    skip: !nonNumberParentIds.length,
    fetchPolicy: "cache-and-network",
  });

  const targetFromSiblings = useMemo(() => {
    if (!siblingDataTypesData) {
      return null;
    }

    /**
     * We check the siblings (direct children of direct parents) to see if any of them have conversions defined.
     * We assume that there is only one 'canonical' conversion target in a given collection of siblings.
     * If we find one, it is the only conversion target we will allow the user to select.
     */
    const siblings = getRoots(
      mapGqlSubgraphFieldsFragmentToSubgraph<DataTypeRootType>(
        siblingDataTypesData.queryDataTypes,
      ),
    );

    for (const sibling of siblings) {
      const existingConversionMap = sibling.metadata.conversions;

      const targetBaseUrl = typedKeys(existingConversionMap ?? {})[0];

      if (!targetBaseUrl) {
        continue;
      }

      const target = latestDataTypes?.[targetBaseUrl];

      if (!target) {
        throw new Error(`Target data type not found: ${targetBaseUrl}`);
      }

      setHasCheckedSiblings(true);

      return target;
    }

    setHasCheckedSiblings(true);

    return null;
  }, [siblingDataTypesData, latestDataTypes]);

  useEffect(() => {
    if (!targetFromSiblings) {
      return;
    }

    if (Object.keys(ownConversions ?? {}).length === 0) {
      return;
    }

    if (!ownConversions?.[targetFromSiblings.metadata.recordId.baseUrl]) {
      /**
       * Wipe the conversion targets if the user doesn't have the canonical for its siblings set.
       * The user can choose to add this via the button. We don't want any other targets set.
       */
      setValue("conversions", {});
    }
  }, [setValue, ownConversions, targetFromSiblings]);

  const dataTypeOptions = useMemo(() => {
    if (!dataTypes) {
      return [];
    }

    const dataTypesArray = Object.values(dataTypes);

    const baseUrl = extractBaseUrl(dataType.$id);

    return buildDataTypeTreesForSelector({
      targetDataTypes: dataTypesArray
        .filter(
          (type) =>
            "type" in type.schema &&
            /**
             * Only allow defining conversions to numbers for now (we only show mathematical operators)
             */
            type.schema.type === "number" &&
            /**
             * Don't include the data type itself as a conversion target.
             */
            type.metadata.recordId.baseUrl !== baseUrl &&
            /**
             * Don't include 'Number' itself as a conversion target.
             * These are already numbers.
             */
            type.metadata.recordId.baseUrl !==
              blockProtocolDataTypes.number.dataTypeBaseUrl &&
            /**
             * Don't include anything which itself defines a conversion target.
             * There should be another data type in its group which can be converted to.
             * @todo this does not hold for data types which have defined conversions to targets in other groups.
             */
            !Object.keys(type.metadata.conversions ?? {}).length,
        )
        .map((type) => type.schema),
      dataTypePoolById: dataTypesArray.reduce<Record<VersionedUrl, DataType>>(
        (acc, type) => {
          if (
            type.metadata.recordId.baseUrl === baseUrl /**
             * Don't include anything which itself defines a conversion target.
             * There should be another data type in its group which can be converted to.
             * @todo this does not hold for data types which have defined conversions to targets in other groups.
             */ ||
            !Object.keys(type.metadata.conversions ?? {}).length
          ) {
            return acc;
          }

          acc[type.schema.$id] = type.schema;
          return acc;
        },
        {},
      ),
    });
  }, [dataTypes, dataType.$id]);

  if (
    (nonNumberParentIds.length && !hasCheckedSiblings) ||
    Object.keys(ownConversions ?? {}).length > 0 ||
    Object.keys(inheritedConversions ?? {}).length > 0 ||
    targetFromSiblings?.schema.$id === dataType.$id
  ) {
    return null;
  }

  return (
    <Box>
      <Stack gap={1} mb={2}>
        <Typography variant="smallTextParagraphs" component="p">
          You can define how to convert values of this type to other data types.
        </Typography>
        {targetFromSiblings && (
          <Typography variant="smallTextParagraphs" component="p">
            In this data type group, conversions are defined via{" "}
            {targetFromSiblings.schema.title}.
          </Typography>
        )}
      </Stack>
      {selectingConversionTarget ? (
        <Box
          sx={{
            width: 600,
            borderRadius: 2,
          }}
        >
          <DataTypeSelector
            autoFocus
            dataTypes={dataTypeOptions}
            hideHint
            onSelect={(newParentTypeId) => {
              addConversionTarget(newParentTypeId);
              setSelectingConversionTarget(false);
            }}
            placeholder="Select a data type to convert to..."
          />
        </Box>
      ) : (
        <Button
          onClick={() => {
            if (targetFromSiblings) {
              addConversionTarget(targetFromSiblings.schema.$id);
            } else {
              setSelectingConversionTarget(true);
            }
          }}
          size="xs"
        >
          {targetFromSiblings
            ? `Add conversion to ${targetFromSiblings.schema.title}`
            : "Add conversion to another type"}
        </Button>
      )}
    </Box>
  );
};
