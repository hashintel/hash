import { useQuery } from "@apollo/client";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import { typedEntries, typedValues } from "@local/advanced-types/typed-entries";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type {
  GetDataTypeConversionTargetsQuery,
  GetDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { Link } from "../../../shared/ui/link";
import { useDataTypesContext } from "../data-types-context";
import { useSlideStack } from "../slide-stack";
import { ConversionEditor } from "./data-type-conversions/conversion-editor";
import { ConversionTargetEditor } from "./data-type-conversions/conversion-target-editor";
import type { DataTypeFormData } from "./data-type-form";
import { useInheritedConstraints } from "./shared/use-inherited-constraints";

type CombinedConversions = Record<
  BaseUrl,
  {
    conversions: Conversions;
    inheritedFromTitle: string | null;
    target: DataTypeWithMetadata;
  }
>;

export const DataTypeConversions = ({
  dataType,
  isReadOnly,
}: {
  dataType: DataType;
  isReadOnly: boolean;
}) => {
  const { control } = useFormContext<DataTypeFormData>();

  const { dataTypes } = useDataTypesContext();

  const inheritedConstraints = useInheritedConstraints();

  const inheritedConversions = inheritedConstraints.conversions;

  const ownConversions = useWatch({ control, name: "conversions" });

  const combinedConversions = useMemo<CombinedConversions>(() => {
    const combined: CombinedConversions = {};

    const latestDataTypeByBaseUrl: Record<BaseUrl, DataTypeWithMetadata> = {};
    for (const dataTypeOption of Object.values(dataTypes ?? {})) {
      const currentLatest =
        latestDataTypeByBaseUrl[dataTypeOption.metadata.recordId.baseUrl];

      if (
        !currentLatest ||
        compareOntologyTypeVersions(
          dataTypeOption.metadata.recordId.version,
          currentLatest.metadata.recordId.version,
        ) > 0
      ) {
        latestDataTypeByBaseUrl[dataTypeOption.metadata.recordId.baseUrl] =
          dataTypeOption;
      }
    }

    for (const [targetBaseUrl, conversions] of typedEntries(
      ownConversions ?? {},
    )) {
      const target = latestDataTypeByBaseUrl[targetBaseUrl];

      if (!target) {
        throw new Error(`Target data type not found: ${targetBaseUrl}`);
      }

      combined[targetBaseUrl] = {
        conversions,
        inheritedFromTitle: null,
        target,
      };
    }

    for (const [targetBaseUrl, { value: conversions, from }] of typedEntries(
      inheritedConversions ?? {},
    )) {
      if (!combined[targetBaseUrl]) {
        const target = Object.values(dataTypes ?? {}).find(
          (option) => option.metadata.recordId.baseUrl === targetBaseUrl,
        );

        if (!target) {
          throw new Error(`Target data type not found: ${targetBaseUrl}`);
        }

        combined[targetBaseUrl] = {
          conversions,
          inheritedFromTitle: from.title,
          target,
        };
      }
    }

    return combined;
  }, [inheritedConversions, ownConversions, dataTypes]);

  const { pushToSlideStack } = useSlideStack();

  const { data, loading } = useQuery<
    GetDataTypeConversionTargetsQuery,
    GetDataTypeConversionTargetsQueryVariables
  >(getDataTypeConversionTargetsQuery, {
    variables: {
      /**
       * This fetches the conversions available from the data types that _this_ data type defines conversions to ("local conversions").
       * We can then add our 'local conversion' to each target data type's conversions to get the full list of conversions.
       *
       * We don't fetch _this_ data type's conversionTargets from the API if it has any defined because:
       * 1. They may not be persisted in the db yet
       * 2. The user may be editing them locally
       */
      dataTypeIds: Object.keys(combinedConversions).length
        ? Object.values(combinedConversions).map(
            ({ target }) => target.schema.$id,
          )
        : /**
           * If the data type has no conversions defined, we fetch its own conversionTargets.
           * A data type which is the TARGET of conversions in a group won't have any defined on itself.
           * @todo when we have data types which may be both the target of conversions,
           * and have their own conversions defined, these will have to be combined somehow.
           */
          [dataType.$id],
    },
  });

  const conversionTargetsMap = data?.getDataTypeConversionTargets;

  const conversionTargets = typedEntries(conversionTargetsMap ?? {})
    .flatMap<{
      targetDataTypeId: VersionedUrl;
      title: string;
      valueForOneOfThese: number;
    } | null>(([directTargetDataTypeId, onwardConversionsMap]) => {
      if (!Object.keys(combinedConversions).length) {
        return typedEntries(onwardConversionsMap).map(
          ([onwardTargetDataTypeId, { conversions, title }]) => ({
            targetDataTypeId: onwardTargetDataTypeId,
            title,
            valueForOneOfThese: createConversionFunction(conversions)(1),
          }),
        );
      }

      const localConversions =
        combinedConversions[extractBaseUrl(directTargetDataTypeId)]
          ?.conversions;

      if (!localConversions) {
        throw new Error(
          `Local conversions not found for ${directTargetDataTypeId}`,
        );
      }

      const conversionFnToDirectTarget = createConversionFunction([
        localConversions.to,
      ]);

      const directTarget = dataTypes?.[directTargetDataTypeId];

      if (!directTarget) {
        throw new Error(
          `Direct target data type not found: ${directTargetDataTypeId}`,
        );
      }

      const directTargetData = {
        targetDataTypeId: directTargetDataTypeId,
        title: directTarget.schema.title,
        valueForOneOfThese: conversionFnToDirectTarget(1),
      };

      return [
        directTargetData,
        ...typedEntries(onwardConversionsMap).map(
          ([
            onwardTargetDataTypeId,
            { conversions: onwardConversions, title },
          ]) => {
            if (onwardTargetDataTypeId === dataType.$id) {
              return null;
            }

            const conversionFunction = createConversionFunction([
              localConversions.to,
              ...onwardConversions,
            ]);

            return {
              targetDataTypeId: onwardTargetDataTypeId,
              title,
              valueForOneOfThese: conversionFunction(1),
            };
          },
        ),
      ];
    })
    .filter((conversionTarget) => conversionTarget !== null)
    .sort((a, b) => a.valueForOneOfThese - b.valueForOneOfThese);

  const type = useWatch({ control, name: "constraints.type" });

  if (
    loading ||
    (!Object.keys(conversionTargetsMap ?? {}).length && isReadOnly) ||
    type !== "number"
  ) {
    return null;
  }

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Conversions
      </Typography>

      {conversionTargets.length > 0 && (
        <Box>
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[80] }}
          >
            Values of this data type can be converted to the following:
          </Typography>
          {conversionTargets.map((conversionTarget) => {
            return (
              <Box key={conversionTarget.title}>
                <Typography variant="smallTextParagraphs">
                  <Box component="span" sx={{ fontWeight: 300 }}>
                    1 {dataType.title} ={" "}
                  </Box>
                  <Box component="span" sx={{ fontWeight: 500 }}>
                    {formatNumber(conversionTarget.valueForOneOfThese)}
                    <Link
                      href={
                        generateLinkParameters(
                          conversionTarget.targetDataTypeId,
                        ).href
                      }
                      onClick={(event) => {
                        event.preventDefault();
                        pushToSlideStack({
                          kind: "dataType",
                          itemId: conversionTarget.targetDataTypeId,
                        });
                      }}
                      sx={{ textDecoration: "none", ml: 0.5 }}
                    >
                      {conversionTarget.title}
                    </Link>
                  </Box>
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {Object.keys(combinedConversions).length > 0 && (
        <Box mt={2}>
          <Typography
            component="p"
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[80], mb: 1.5 }}
          >
            Calculated according to the following formulae:
          </Typography>
          {typedValues(combinedConversions).map(
            ({ conversions, inheritedFromTitle, target }) => {
              return (
                <ConversionEditor
                  conversions={conversions}
                  dataType={dataType}
                  inheritedFromTitle={inheritedFromTitle}
                  isReadOnly={isReadOnly}
                  key={target.metadata.recordId.baseUrl}
                  target={target}
                />
              );
            },
          )}
        </Box>
      )}

      <ConversionTargetEditor dataType={dataType} />
    </Box>
  );
};
