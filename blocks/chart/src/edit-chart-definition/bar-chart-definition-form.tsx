import type {
  EntityRootType,
  EntityType,
  Subgraph,
} from "@blockprotocol/graph";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import type { FunctionComponent } from "react";
import { Controller, useFormContext } from "react-hook-form";

import type { ChartDefinition } from "../types/chart-definition";
import {
  CountLinksForm,
  generateInitialChartDefinition as generateInitialCountLinkedEntitiesChartDefinition,
  generateXAxisLabel as generateCountLinkedEntitiesXAxisLabel,
} from "./bar-graph-definition-form/count-linked-entities-form";
import {
  generateInitialChartDefinition as generateInitialGroupByPropertyChartDefinition,
  generateYAxisLabel as generateGroupByPropertyYAxisLabel,
  GroupByPropertyForm,
} from "./bar-graph-definition-form/group-by-property-form";

const barChartVariantNames: Record<
  ChartDefinition<"bar-chart">["variant"],
  string
> = {
  "group-by-property": "Group by Property",
  "count-links": "Count Links",
};

export const BarChartDefinitionForm: FunctionComponent<{
  entityTypes: EntityType[];
  queryResult: Subgraph<EntityRootType>;
}> = ({ entityTypes, queryResult }) => {
  const { control, setValue, watch } =
    useFormContext<ChartDefinition<"bar-chart">>();

  const currentVariant = watch("variant");

  return (
    <>
      <Controller
        control={control}
        name="variant"
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="bar-chart-variant">Bar Chart Variant</InputLabel>
            <Select
              {...field}
              onChange={(event) => {
                const updatedVariant = event.target
                  .value as ChartDefinition<"bar-chart">["variant"];

                if (updatedVariant === "group-by-property") {
                  const initialDefinition =
                    generateInitialGroupByPropertyChartDefinition({
                      queryResult,
                    });

                  if (initialDefinition) {
                    setValue("entityTypeId", initialDefinition.entityTypeId);
                    setValue(
                      "groupByPropertyTypeId",
                      initialDefinition.groupByPropertyTypeId,
                    );
                    setValue("xAxisLabel", initialDefinition.xAxisLabel);
                    setValue("yAxisLabel", initialDefinition.yAxisLabel);
                  }
                } else {
                  const initialDefinition =
                    generateInitialCountLinkedEntitiesChartDefinition({
                      queryResult,
                    });

                  if (initialDefinition) {
                    setValue("entityTypeId", initialDefinition.entityTypeId);
                    setValue(
                      "labelPropertyTypeId",
                      initialDefinition.labelPropertyTypeId,
                    );
                    setValue("direction", initialDefinition.direction);
                    setValue(
                      "linkEntityTypeId",
                      initialDefinition.linkEntityTypeId,
                    );
                    setValue("xAxisLabel", initialDefinition.xAxisLabel);
                    setValue("yAxisLabel", initialDefinition.yAxisLabel);
                  }
                }

                field.onChange(event);
              }}
              labelId="bar-chart-variant"
              label="Bar Chart Variant"
              required
            >
              {Object.entries(barChartVariantNames).map(([variant, label]) => (
                <MenuItem key={variant} value={variant}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
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
                    if (currentVariant === "group-by-property") {
                      setValue(
                        "yAxisLabel",
                        generateGroupByPropertyYAxisLabel({
                          entityType: selectedEntityType,
                        }),
                      );
                    } else {
                      setValue(
                        "xAxisLabel",
                        generateCountLinkedEntitiesXAxisLabel({
                          entityType: selectedEntityType,
                        }),
                      );
                    }
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
      {currentVariant === "count-links" ? (
        <CountLinksForm entityTypes={entityTypes} queryResult={queryResult} />
      ) : (
        <GroupByPropertyForm
          entityTypes={entityTypes}
          queryResult={queryResult}
        />
      )}
    </>
  );
};
