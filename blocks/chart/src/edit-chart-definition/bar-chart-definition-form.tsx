import { EntityRootType, EntityType, Subgraph } from "@blockprotocol/graph";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { FunctionComponent } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { ChartDefinition } from "../types/chart-definition";
import { CountLinksForm } from "./bar-graph-definition-form/count-linked-entities-form";
import {
  generateYAxisLabel,
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
                    setValue(
                      "yAxisLabel",
                      generateYAxisLabel({
                        entityType: selectedEntityType,
                      }),
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
