import { EntityType, PropertyType, VersionedUrl } from "@blockprotocol/graph";
import {
  EntityId,
  EntityRootType,
  Subgraph,
} from "@blockprotocol/graph/temporal";
import {
  getEntityTypeById,
  getPropertyTypeById,
  getRoots,
} from "@blockprotocol/graph/temporal/stdlib";
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
        const inheritsFromEntityType = getEntityTypeById(
          subgraph,
          $ref,
        )?.schema;

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

export const EditChartDefinition: FunctionComponent<{
  initialChartDefinition?: ChartDefinition;
  queryResults: Record<EntityId, Subgraph<EntityRootType>>;
  onSubmit: (updatedChartDefinition: ChartDefinition) => void;
}> = ({ initialChartDefinition, queryResults, onSubmit }) => {
  const { control, watch, handleSubmit, register, formState, setValue } =
    useForm<ChartDefinition>({
      defaultValues: initialChartDefinition ?? {
        /** @todo: make these configurable when we support additional chart kinds/variants */
        kind: "bar-chart",
        variant: "group-by-property",
        entityTypeId: "" as VersionedUrl,
        groupByPropertyTypeId: "" as VersionedUrl,
        xAxisLabel: "",
        yAxisLabel: "",
      },
    });

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

    /** @todo: we need some way of knowing which subgraph the type came from */
    const subgraph = Object.values(queryResults)[0]!;

    const propertyTypes = getEntityTypePropertyTypes(subgraph, entityType);

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
                      `Number of ${pluralize(
                        selectedEntityType.title.toLowerCase(),
                      )}`,
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
                    `${
                      entityType.title
                    } ${groupByPropertyType.title.toLowerCase()}`,
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
        Update Chart
      </Button>
    </Box>
  );
};
