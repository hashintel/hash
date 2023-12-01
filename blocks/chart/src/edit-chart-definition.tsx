import {
  EntityId,
  EntityRootType,
  EntityType,
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
import { FunctionComponent, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import {
  BarChartDefinitionForm,
  findSubgraphWhichContainsEntityType,
  generateXAxisLabel,
  generateYAxisLabel,
  getEntityTypePropertyTypes,
} from "./edit-chart-definition/bar-chart-definition-form";
import { GraphChartDefinitionForm } from "./edit-chart-definition/graph-chart-definition-form";
import { ChartDefinition } from "./types/chart-definition";

export const EditChartDefinition: FunctionComponent<{
  initialChartDefinition?: ChartDefinition;
  queryResults: Record<EntityId, Subgraph<EntityRootType>>;
  onSubmit: (updatedChartDefinition: ChartDefinition) => void;
}> = ({ initialChartDefinition, queryResults, onSubmit }) => {
  // Get all entity types for entities in the query results
  const entityTypes = useMemo(
    () =>
      Object.values(queryResults).reduce<EntityType[]>(
        (prev, currentSubgraph) => {
          const entities = getRoots(currentSubgraph);

          const missingEntityTypeIds = entities
            .map((entity) => entity.metadata.entityTypeId)
            .filter(
              (entityTypeId) =>
                !prev.some((entityType) => entityType.$id === entityTypeId),
            )
            .filter(
              (entityTypeId, index, all) => all.indexOf(entityTypeId) === index,
            );

          const missingEntityTypes = missingEntityTypeIds
            .map(
              (entityTypeId) =>
                getEntityTypeById(currentSubgraph, entityTypeId)?.schema ?? [],
            )
            .flat();

          return [...prev, ...missingEntityTypes];
        },
        [],
      ),
    [queryResults],
  );

  const defaultEntityType = useMemo(
    () => (entityTypes.length === 1 ? entityTypes[0] : undefined),
    [entityTypes],
  );

  const defaultGroupByPropertyType = useMemo(() => {
    if (defaultEntityType) {
      const subgraphWithEntityType = findSubgraphWhichContainsEntityType({
        subgraphs: Object.values(queryResults),
        entityTypeId: defaultEntityType.$id,
      });

      if (subgraphWithEntityType) {
        const propertyTypes = getEntityTypePropertyTypes(
          subgraphWithEntityType,
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
    }
  }, [queryResults, defaultEntityType]);

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
          Configure {chartKind === "bar-chart" ? "Bar Chart" : "Graph Chart"}
        </Typography>
        {chartKind === "bar-chart" ? (
          <BarChartDefinitionForm
            entityTypes={entityTypes}
            queryResults={queryResults}
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
