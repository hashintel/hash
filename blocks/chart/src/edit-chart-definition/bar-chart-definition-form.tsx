import {
  EntityRootType,
  EntityType,
  extractBaseUrl,
  PropertyType,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import {
  getEntityTypeById,
  getPropertyTypeById,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import pluralize from "pluralize";
import { FunctionComponent, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { ChartDefinition } from "../types/chart-definition";

export const getEntityTypePropertyTypes = (
  subgraph: Subgraph,
  entityType: EntityType,
): PropertyType[] => {
  const propertyTypeIds = Object.values(entityType.properties).map((value) =>
    "$ref" in value ? value.$ref : value.items.$ref,
  );

  const propertyTypes = propertyTypeIds.map((propertyTypeId) => {
    const propertyType = getPropertyTypeById(subgraph, propertyTypeId)?.schema;

    if (!propertyType) {
      throw new Error(
        `Could not get property type from subgraph: ${propertyTypeId}`,
      );
    }

    return propertyType;
  });

  return [
    ...propertyTypes,
    ...(entityType.allOf
      ?.map(({ $ref }) => {
        const inheritsFromEntityType = getEntityTypeById(subgraph, $ref)
          ?.schema;

        if (!inheritsFromEntityType) {
          throw new Error(
            `Could not get inherited entity type from subgraph: ${$ref}`,
          );
        }

        return getEntityTypePropertyTypes(subgraph, inheritsFromEntityType);
      })
      .flat() ?? []),
  ];
};

export const generateXAxisLabel = (params: {
  entityType: EntityType;
  groupByPropertyType: PropertyType;
}) =>
  `${
    params.entityType.title
  } ${params.groupByPropertyType.title.toLowerCase()}`;

export const generateYAxisLabel = (params: { entityType: EntityType }) =>
  `Number of ${pluralize(params.entityType.title.toLowerCase())}`;

export const generateInitialChartDefinition = (params: {
  queryResult: Subgraph<EntityRootType>;
}): ChartDefinition | undefined => {
  const { queryResult } = params;

  const resultEntity = getRoots(queryResult)[0]!;

  const entityType = getEntityTypeById(
    queryResult,
    resultEntity.metadata.entityTypeId,
  )?.schema;

  if (!entityType) {
    return undefined;
  }

  const propertyTypes = getEntityTypePropertyTypes(queryResult, entityType);

  const resultPropertyTypeWithTextValue = propertyTypes.find(
    ({ $id, oneOf }) =>
      Object.keys(resultEntity.properties).some(
        (propertyTypeBaseUrl) => extractBaseUrl($id) === propertyTypeBaseUrl,
      ) &&
      oneOf.some(
        (value) =>
          "$ref" in value &&
          value.$ref ===
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      ),
    [],
  );

  const groupByPropertyType =
    resultPropertyTypeWithTextValue ?? propertyTypes[0];

  if (!groupByPropertyType) {
    return undefined;
  }

  return {
    kind: "bar-chart",
    variant: "group-by-property",
    entityTypeId: entityType.$id,
    groupByPropertyTypeId: groupByPropertyType.$id,
    xAxisLabel: generateXAxisLabel({
      entityType,
      groupByPropertyType,
    }),
    yAxisLabel: generateYAxisLabel({
      entityType,
    }),
  };
};

export const BarChartDefinitionForm: FunctionComponent<{
  queryResult: Subgraph<EntityRootType>;
  entityTypes: EntityType[];
}> = ({ entityTypes, queryResult }) => {
  const { control, register, setValue, watch } =
    useFormContext<ChartDefinition<"bar-chart">>();

  const entityTypeId = watch("entityTypeId");

  const entityType = useMemo(
    () =>
      /** @todo: figure out why react hook form makes this always defined */
      (entityTypeId as VersionedUrl | "") !== ""
        ? entityTypes.find(({ $id }) => $id === entityTypeId)
        : undefined,
    [entityTypes, entityTypeId],
  );

  const entityTypePropertyTypes = useMemo(() => {
    if (!entityType) {
      return undefined;
    }

    const propertyTypes = getEntityTypePropertyTypes(queryResult, entityType);

    return propertyTypes;
  }, [entityType, queryResult]);

  return (
    <>
      {entityTypes.length > 0 ? (
        <Controller
          control={control}
          name="entityTypeId"
          render={({ field }) => (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel id="entity-type">Entity type</InputLabel>
              <Select
                {...field}
                onChange={(event) => {
                  const selectedEntityType = entityTypes.find(
                    ({ $id }) => event.target.value === $id,
                  );

                  if (selectedEntityType) {
                    setValue(
                      "yAxisLabel",
                      generateYAxisLabel({ entityType: selectedEntityType }),
                    );
                  }

                  field.onChange(event);
                }}
                labelId="entity-type"
                label="Entity type"
                required
              >
                {entityTypes.map(({ $id, title }) => (
                  <MenuItem key={$id} value={$id}>
                    {title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="groupByPropertyTypeId"
        disabled={!entityTypePropertyTypes}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="group-by-property">Group by property</InputLabel>
            <Select
              {...field}
              // prevent MUI from logging a warning
              value={entityTypePropertyTypes ? field.value : ""}
              onChange={(event) => {
                const groupByPropertyType = entityTypePropertyTypes?.find(
                  ({ $id }) => $id === event.target.value,
                );

                if (entityType && groupByPropertyType) {
                  setValue(
                    "xAxisLabel",
                    generateXAxisLabel({ entityType, groupByPropertyType }),
                  );
                }

                field.onChange(event);
              }}
              labelId="group-by-property"
              label="Group by property"
              required
            >
              {entityTypePropertyTypes?.map(({ $id, title }) => (
                <MenuItem key={$id} value={$id}>
                  {title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <TextField
        id="x-axis-label"
        fullWidth
        label="X Axis Label"
        /** @todo: figure out why the label isn't shrinking when the value is updated programmatically */
        InputLabelProps={{ shrink: true }}
        {...register("xAxisLabel")}
      />
      <TextField
        id="y-axis-label"
        fullWidth
        label="Y Axis Label"
        /** @todo: figure out why the label isn't shrinking when the value is updated programmatically */
        InputLabelProps={{ shrink: true }}
        {...register("yAxisLabel")}
      />
    </>
  );
};
