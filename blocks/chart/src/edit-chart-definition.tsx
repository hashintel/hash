import {
  EntityId,
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
  Box,
  // eslint-disable-next-line no-restricted-imports
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import pluralize from "pluralize";
import { FunctionComponent, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { ChartDefinition } from "./types/chart-definition";

const getEntityTypePropertyTypes = (
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

const findSubgraphWhichContainsEntityType = (params: {
  subgraphs: Subgraph[];
  entityTypeId: VersionedUrl;
}) => {
  const subgraphWithEntityType = params.subgraphs.find((subgraph) => {
    const entityType = getEntityTypeById(subgraph, params.entityTypeId);

    return !!entityType;
  });

  return subgraphWithEntityType;
};

const generateXAxisLabel = (params: {
  entityType: EntityType;
  groupByPropertyType: PropertyType;
}) =>
  `${
    params.entityType.title
  } ${params.groupByPropertyType.title.toLowerCase()}`;

const generateYAxisLabel = (params: { entityType: EntityType }) =>
  `Number of ${pluralize(params.entityType.title.toLowerCase())}`;

export const generateInitialChartDefinition = (params: {
  queryResults: Record<EntityId, Subgraph<EntityRootType>>;
}): ChartDefinition | undefined => {
  const subgraphWithResults = Object.values(params.queryResults).find(
    (subgraph) => getRoots(subgraph).length > 0,
  );

  if (!subgraphWithResults) {
    return undefined;
  }

  const resultEntity = getRoots(subgraphWithResults)[0]!;

  const entityType = getEntityTypeById(
    subgraphWithResults,
    resultEntity.metadata.entityTypeId,
  )?.schema;

  if (!entityType) {
    return undefined;
  }

  const propertyTypes = getEntityTypePropertyTypes(
    subgraphWithResults,
    entityType,
  );

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

  const { control, watch, handleSubmit, register, formState, setValue } =
    useForm<ChartDefinition>({
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

    const subgraphWithEntityType = findSubgraphWhichContainsEntityType({
      subgraphs: Object.values(queryResults),
      entityTypeId: entityType.$id,
    });

    if (!subgraphWithEntityType) {
      throw new Error("Could not find query subgraph with entity type");
    }

    const propertyTypes = getEntityTypePropertyTypes(
      subgraphWithEntityType,
      entityType,
    );

    return propertyTypes;
  }, [entityType, queryResults]);

  const innerSubmit = handleSubmit((data) => {
    onSubmit(data);
  });
  const isSubmitDisabled =
    Object.keys(formState.errors).length > 0 ||
    Object.keys(formState.dirtyFields).length === 0;

  return (
    <Box
      component="form"
      onSubmit={innerSubmit}
      sx={{ display: "flex", flexDirection: "column", rowGap: 2 }}
    >
      <Typography variant="h5" marginBottom={2}>
        Configure group entities by property bar graph
      </Typography>
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
      <Button type="submit" disabled={isSubmitDisabled}>
        {initialChartDefinition ? "Update" : "Create"} Chart
      </Button>
    </Box>
  );
};
