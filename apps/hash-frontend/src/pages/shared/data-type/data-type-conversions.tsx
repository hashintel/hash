import { useQuery } from "@apollo/client";
import type {
  ConversionDefinition,
  Conversions,
  DataType,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { Box, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type {
  GetDataTypeConversionTargetsQuery,
  GetDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { useDataTypesContext } from "../data-types-context";
import type { DataTypeFormData } from "./data-type-form";
import { useInheritedConstraints } from "./shared/use-inherited-constraints";

const ConversionEditor = ({
  definition,
  inheritedFrom,
  isReadOnly,
  sourceTitle,
  targetTitle,
}: {
  definition: ConversionDefinition;
  inheritedFrom: string | null;
  isReadOnly: boolean;
  sourceTitle: string;
  targetTitle: string;
}) => {
  const [operator, left, right] = definition.expression;

  return (
    <Stack direction="row" gap={1}>
      {[left, operator, right].map((token) => {
        if (token === "self") {
          return sourceTitle;
        }
        if (typeof token === "string") {
          return token;
        }

        if (Array.isArray(token)) {
          throw new Error("Nested conversion expressions are not supported");
        }

        return formatNumber(token.const);
      })}
      = {targetTitle}
    </Stack>
  );
};

type CombinedConversions = Record<
  BaseUrl,
  {
    conversions: Conversions;
    inheritedFromTitle: string | null;
    target: DataType;
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

  const { data, loading } = useQuery<
    GetDataTypeConversionTargetsQuery,
    GetDataTypeConversionTargetsQueryVariables
  >(getDataTypeConversionTargetsQuery, {
    variables: { dataTypeIds: [dataType.$id] },
  });

  const conversionTargetsMap = data?.getDataTypeConversionTargets;

  const conversionTargets = Object.values(
    conversionTargetsMap?.[dataType.$id] ?? {},
  );

  console.log({
    conversionTargets,
    inheritedConversions,
    ownConversions,
  });

  const combinedConversions = useMemo<CombinedConversions>(() => {
    const combined: CombinedConversions = {};

    for (const [targetBaseUrl, conversions] of typedEntries(
      ownConversions ?? {},
    )) {
      const target = Object.values(dataTypes ?? {}).find(
        (option) => option.metadata.recordId.baseUrl === targetBaseUrl,
      );

      if (!target) {
        throw new Error(`Target data type not found: ${targetBaseUrl}`);
      }

      combined[targetBaseUrl] = {
        conversions,
        inheritedFromTitle: null,
        target: target.schema,
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
          target: target.schema,
        };
      }
    }

    return combined;
  }, [inheritedConversions, ownConversions, dataTypes]);

  if (loading || (!conversionTargetsMap && isReadOnly)) {
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
            const conversionFunction = createConversionFunction(
              conversionTarget.conversions,
            );

            return (
              <Box key={conversionTarget.title}>
                <Typography variant="smallTextParagraphs">
                  <Box component="span" sx={{ fontWeight: 300 }}>
                    1 {dataType.title} ={" "}
                  </Box>
                  <Box component="span" sx={{ fontWeight: 500 }}>
                    {`${formatNumber(conversionFunction(1))} ${conversionTarget.title}`}
                  </Box>
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {Object.keys(combinedConversions).length > 0 &&
        typedEntries(combinedConversions).map(
          ([
            targetVersionedUrl,
            { conversions, inheritedFromTitle, target },
          ]) => {
            const { from, to } = conversions;

            return (
              <Stack gap={1} key={targetVersionedUrl}>
                <ConversionEditor
                  definition={from}
                  inheritedFrom={inheritedFromTitle}
                  isReadOnly={isReadOnly}
                  sourceTitle={dataType.title}
                  targetTitle={target.title}
                />
                <ConversionEditor
                  definition={to}
                  inheritedFrom={inheritedFromTitle}
                  isReadOnly={isReadOnly}
                  sourceTitle={target.title}
                  targetTitle={dataType.title}
                />
              </Stack>
            );
          },
        )}
    </Box>
  );
};
