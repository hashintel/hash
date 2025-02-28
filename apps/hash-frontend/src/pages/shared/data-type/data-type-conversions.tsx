import { useQuery } from "@apollo/client";
import type {
  ConversionDefinition,
  Conversions,
  DataType,
  Operator,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  buildDataTypeTreesForSelector,
  DataTypeSelector,
  Select,
} from "@hashintel/design-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type {
  BaseUrl,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type {
  GetDataTypeConversionTargetsQuery,
  GetDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { Link } from "../../../shared/ui/link";
import { MenuItem } from "../../../shared/ui/menu-item";
import { useDataTypesContext } from "../data-types-context";
import { useSlideStack } from "../slide-stack";
import { NumberInput } from "./data-type-constraints/shared/number-input";
import type { DataTypeFormData } from "./data-type-form";
import { ItemLabel } from "./shared/item-label";
import { useInheritedConstraints } from "./shared/use-inherited-constraints";

const characterToOpMap = {
  "+": "+",
  "–": "-",
  "×": "*",
  "÷": "/",
};

const operatorCharacters = typedKeys(characterToOpMap);

type OperatorCharacter = (typeof operatorCharacters)[number];

const operatorToOpCharacterMap: Record<Operator, OperatorCharacter> = {
  "+": "+",
  "-": "–",
  "*": "×",
  "/": "÷",
};

const ReadOnlyCalculation = ({
  definition,
  inheritedFrom,
  sourceTitle,
  targetTitle,
}: {
  definition: ConversionDefinition;
  inheritedFrom: string | null;
  sourceTitle: string;
  targetTitle: string;
}) => {
  const [operator, left, right] = definition.expression;

  return (
    <Box>
      <ItemLabel
        tooltip={
          <Box>
            The calculation to convert {sourceTitle} to {targetTitle}.
            {inheritedFrom ? (
              <>
                {" "}
                <br />
                Inherited from ${inheritedFrom}.
              </>
            ) : (
              ""
            )}
          </Box>
        }
      >
        {sourceTitle} to {targetTitle}
      </ItemLabel>
      <Stack direction="row" gap={0.5}>
        {[left, operator, right].map((token, index) => {
          let value: string;

          if (token === "self") {
            value = sourceTitle;
          } else if (typeof token === "string") {
            value = operatorToOpCharacterMap[token];
          } else if (Array.isArray(token)) {
            throw new Error("Nested conversion expressions are not supported");
          } else {
            value = formatNumber(token.const);
          }

          return (
            <Typography
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              variant="smallTextParagraphs"
              sx={{ fontWeight: token === "self" ? 300 : 500 }}
            >
              {value}
            </Typography>
          );
        })}
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          = {targetTitle}
        </Typography>
      </Stack>
    </Box>
  );
};

const OperatorDropdown = ({
  operator,
  onChange,
}: {
  operator: Operator;
  onChange: (operator: Operator) => void;
}) => {
  return (
    <Select
      value={operator}
      onChange={(event) => {
        onChange(event.target.value as Operator);
      }}
      sx={{
        "& svg": {
          display: "none",
        },
        [`& .${outlinedInputClasses.root}`]: {
          boxShadow: "none",
        },
        [`& .${outlinedInputClasses.input}`]: {
          fontSize: 15,
          lineHeight: 1,
          minHeight: "fit-content",
          p: "5px 7px !important",
          textAlign: "center",
        },
      }}
    >
      {operatorCharacters.map((opCharacter) => (
        <MenuItem
          key={opCharacter}
          value={characterToOpMap[opCharacter]}
          sx={{ justifyContent: "center", padding: "8px 10px", fontSize: 14 }}
        >
          {opCharacter}
        </MenuItem>
      ))}
    </Select>
  );
};

const ConversionEditor = ({
  definition,
  direction,
  inheritedFrom,
  isReadOnly,
  self,
  target,
}: {
  definition: ConversionDefinition;
  direction: "from" | "to";
  inheritedFrom: string | null;
  isReadOnly: boolean;
  self: DataType;
  target: DataTypeWithMetadata;
}) => {
  const { control, setValue } = useFormContext<DataTypeFormData>();

  const conversions = useWatch({ control, name: "conversions" });

  const [operator, left, right] = definition.expression;

  if (Array.isArray(left) || Array.isArray(right)) {
    throw new Error("Nested conversion expressions are not supported");
  }

  if (right === "self") {
    throw new Error("Expected a constant value for the right operand");
  }

  if (!isReadOnly) {
    return (
      <ReadOnlyCalculation
        definition={definition}
        inheritedFrom={inheritedFrom}
        sourceTitle={direction === "from" ? self.title : target.schema.title}
        targetTitle={direction === "from" ? target.schema.title : self.title}
      />
    );
  }

  return (
    <Box>
      <ItemLabel
        tooltip={
          <Box>
            The calculation to convert{" "}
            {direction === "from" ? self.title : target.schema.title} to{" "}
            {direction === "from" ? target.schema.title : self.title}.
            {inheritedFrom ? (
              <>
                {" "}
                <br />
                Inherited from ${inheritedFrom}, but may be overridden
              </>
            ) : (
              ""
            )}
          </Box>
        }
      >
        {direction === "from" ? self.title : target.schema.title} to{" "}
        {direction === "from" ? target.schema.title : self.title}
      </ItemLabel>
      <Stack direction="row" alignItems="center" gap={0.5} mt={0.5}>
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          {direction === "from" ? self.title : target.schema.title}
        </Typography>
        <OperatorDropdown
          operator={operator}
          onChange={(newOp) => {
            setValue("conversions", {
              ...conversions,
              [target.metadata.recordId.baseUrl]: {
                ...(conversions?.[target.metadata.recordId.baseUrl] ?? {}),
                [direction]: {
                  expression: [newOp, left, right],
                } satisfies ConversionDefinition,
              },
            });
          }}
        />
        <NumberInput
          onChange={(newRightConst) => {
            setValue("conversions", {
              ...conversions,
              [target.metadata.recordId.baseUrl]: {
                ...(conversions?.[target.metadata.recordId.baseUrl] ?? {}),
                [direction]: {
                  expression: [
                    operator,
                    left,
                    { const: newRightConst, type: "number" },
                  ],
                } satisfies ConversionDefinition,
              },
            });
          }}
          value={right.const}
          sx={{
            px: 1,
            py: "4px",
            borderRadius: 1.5,
            mt: 0,
            width: right.const.toString().length * 12,
          }}
        />
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          = {direction === "from" ? target.schema.title : self.title}
        </Typography>
      </Stack>
    </Box>
  );
};

const NewConversionTargetSelector = ({
  dataType,
  onSelect,
}: {
  dataType: DataTypeWithMetadata;
  onSelect: (dataType: DataTypeWithMetadata) => void;
}) => {
  const { dataTypes } = useDataTypesContext();

  const dataTypeOptions = useMemo(() => {
    if (!dataTypes) {
      return [];
    }

    const dataTypesArray = Object.values(dataTypes);

    return buildDataTypeTreesForSelector({
      targetDataTypes: dataTypesArray
        .filter(
          (type) =>
            "type" in type.schema &&
            type.schema.type === "number" &&
            type.metadata.recordId.baseUrl !==
              dataType.metadata.recordId.baseUrl,
        )
        .map((type) => type.schema),
      dataTypePoolById: dataTypesArray.reduce<Record<VersionedUrl, DataType>>(
        (acc, type) => {
          if (
            type.metadata.recordId.baseUrl ===
            dataType.metadata.recordId.baseUrl
          ) {
            return acc;
          }

          acc[type.schema.$id] = type.schema;
          return acc;
        },
        {},
      ),
    });
  }, [dataTypes, dataType.metadata.recordId.baseUrl]);

  return (
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
  );
};

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

  const [isAddingNewConversionTarget, setIsAddingNewConversionTarget] =
    useState(false);

  const { pushToSlideStack } = useSlideStack();

  const { data, loading } = useQuery<
    GetDataTypeConversionTargetsQuery,
    GetDataTypeConversionTargetsQueryVariables
  >(getDataTypeConversionTargetsQuery, {
    variables: { dataTypeIds: [dataType.$id] },
  });

  const conversionTargetsMap = data?.getDataTypeConversionTargets;

  const conversionTargets = typedEntries(
    conversionTargetsMap?.[dataType.$id] ?? {},
  ).map(([targetDataTypeId, { title, conversions }]) => ({
    targetDataTypeId,
    title,
    conversions,
  }));

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
                    {formatNumber(conversionFunction(1))}
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
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[80] }}
          >
            Calculated according to the following formulae:
          </Typography>
          {typedEntries(combinedConversions).map(
            ([
              targetVersionedUrl,
              { conversions, inheritedFromTitle, target },
            ]) => {
              const { from, to } = conversions;

              return (
                <Stack gap={1.5} mt={0.5} key={targetVersionedUrl}>
                  <ConversionEditor
                    definition={from}
                    direction="from"
                    inheritedFrom={inheritedFromTitle}
                    isReadOnly={isReadOnly}
                    self={dataType}
                    target={target}
                  />
                  <ConversionEditor
                    definition={to}
                    direction="to"
                    inheritedFrom={inheritedFromTitle}
                    isReadOnly={isReadOnly}
                    self={dataType}
                    target={target}
                  />
                </Stack>
              );
            },
          )}
        </Box>
      )}
    </Box>
  );
};
