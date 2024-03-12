import type {
  EntityRootType,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import { getEntityTypeById, getRoots } from "@blockprotocol/graph/stdlib";
import {
  Box,
  // eslint-disable-next-line no-restricted-imports
  Button,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { BarChartDefinitionForm } from "./edit-chart-definition/bar-chart-definition-form";
import {
  generateXAxisLabel,
  generateYAxisLabel,
} from "./edit-chart-definition/bar-graph-definition-form/group-by-property-form";
import { GraphChartDefinitionForm } from "./edit-chart-definition/graph-chart-definition-form";
import { getEntityTypePropertyTypes } from "./edit-chart-definition/util";
import type { ChartDefinition } from "./types/chart-definition";

const chartKindToLabel: Record<ChartDefinition["kind"], string> = {
  "bar-chart": "Bar Chart",
  "graph-chart": "Network Graph Chart",
};

export const EditChartDefinition: FunctionComponent<{
  initialChartDefinition?: ChartDefinition;
  queryResult: Subgraph<EntityRootType>;
  onSubmit: (updatedChartDefinition: ChartDefinition) => void;
}> = ({ initialChartDefinition, queryResult, onSubmit }) => {
  // Get all entity types for entities in the query results
  const entityTypes = useMemo(() => {
    const entities = getRoots(queryResult);

    return entities
      .map((entity) => entity.metadata.entityTypeId)
      .filter((entityTypeId, index, all) => all.indexOf(entityTypeId) === index)
      .map(
        (entityTypeId) =>
          getEntityTypeById(queryResult, entityTypeId)?.schema ?? [],
      )
      .flat();
  }, [queryResult]);

  const defaultEntityType = useMemo(
    () => (entityTypes.length === 1 ? entityTypes[0] : undefined),
    [entityTypes],
  );

  const defaultGroupByPropertyType = useMemo(() => {
    if (defaultEntityType) {
      const propertyTypes = getEntityTypePropertyTypes(
        queryResult,
        defaultEntityType,
      );

      const propertyTypeWithTextValue = propertyTypes.find(
        ({ oneOf }) =>
          oneOf.some(
            (value) =>
              "$ref" in value &&
              value.$ref ===
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          ),
        [],
      );

      if (propertyTypeWithTextValue) {
        return propertyTypeWithTextValue;
      }

      return propertyTypes[0];
    }
  }, [queryResult, defaultEntityType]);

  const form = useForm<ChartDefinition>({
    defaultValues: initialChartDefinition ?? {
      /** @todo: make these configurable when we support additional chart kinds/variants */
      kind: "bar-chart",
      variant: "group-by-property",
      entityTypeId: defaultEntityType?.$id ?? ("" as VersionedUrl),
      groupByPropertyTypeId:
        defaultGroupByPropertyType?.$id ?? ("" as VersionedUrl),
      xAxisLabel:
        defaultEntityType && defaultGroupByPropertyType
          ? generateXAxisLabel({
              entityType: defaultEntityType,
              groupByPropertyType: defaultGroupByPropertyType,
            })
          : "",
      yAxisLabel: defaultEntityType
        ? generateYAxisLabel({ entityType: defaultEntityType })
        : "",
    },
  });

  const { watch, handleSubmit, formState } = form;

  const chartKind = watch("kind");

  const innerSubmit = handleSubmit((data) => {
    onSubmit(data);
  });

  const isSubmitDisabled =
    Object.keys(formState.errors).length > 0 ||
    Object.keys(formState.dirtyFields).length === 0;

  return (
    <FormProvider {...form}>
      <Box
        component="form"
        onSubmit={innerSubmit}
        sx={{ display: "flex", flexDirection: "column", rowGap: 2 }}
      >
        <Typography variant="h5" marginBottom={2}>
          Configure {chartKindToLabel[chartKind]}
        </Typography>
        {chartKind === "bar-chart" ? (
          <BarChartDefinitionForm
            entityTypes={entityTypes}
            queryResult={queryResult}
          />
        ) : (
          <GraphChartDefinitionForm />
        )}
        <Button type="submit" disabled={isSubmitDisabled}>
          {initialChartDefinition ? "Update" : "Create"} Chart
        </Button>
      </Box>
    </FormProvider>
  );
};
