import type {
  EntityRootType,
  EntityType,
  PropertyType,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import { extractBaseUrl } from "@blockprotocol/graph";
import { getEntityTypeById, getRoots } from "@blockprotocol/graph/stdlib";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import type {
  BarChartGroupByPropertyVariant,
  ChartDefinition,
} from "../../types/chart-definition";
import { getEntityTypePropertyTypes } from "../util";

export const generateXAxisLabel = (params: {
  entityType: EntityType;
  groupByPropertyType: PropertyType;
}) =>
  `${
    params.entityType.title
  } ${params.groupByPropertyType.title.toLowerCase()}`;

/**
 * @todo upgrade block to use in-repo @blockprotocol/graph and use titlePlural from schema here
 */
export const generateYAxisLabel = (params: { entityType: EntityType }) =>
  `Number of ${pluralize(params.entityType.title.toLowerCase())}`;

export const generateInitialChartDefinition = (params: {
  queryResult: Subgraph<EntityRootType>;
}): BarChartGroupByPropertyVariant | undefined => {
  const { queryResult } = params;

  const resultEntity = getRoots(queryResult)[0];

  if (!resultEntity) {
    return undefined;
  }

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

export const GroupByPropertyForm: FunctionComponent<{
  queryResult: Subgraph<EntityRootType>;
  entityTypes: EntityType[];
}> = ({ entityTypes, queryResult }) => {
  const { control, register, watch, setValue } =
    useFormContext<ChartDefinition>();

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
        {...register("xAxisLabel")}
      />
      <TextField
        id="y-axis-label"
        fullWidth
        label="Y Axis Label"
        {...register("yAxisLabel")}
      />
    </>
  );
};
