import type { FunctionComponent, useCallback, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type {
  EntityRootType,
  EntityType,
  extractBaseUrl,
  ParseVersionedUrlError,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import {
  getEntityTypeById,
  getIncomingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";

import type {
  BarChartCountLinkedEntitiesVariant,
  ChartDefinition,
} from "../../types/chart-definition";
import { getEntityTypePropertyTypes } from "../util";

export const generateXAxisLabel = (params: { entityType: EntityType }) =>
  pluralize(params.entityType.title);

export const generateYAxisLabel = (params: {
  linkEntityType: EntityType;
  direction: "incoming" | "outgoing";
}) =>
  `Number of ${
    params.direction
  } ${params.linkEntityType.title.toLowerCase()} links`;

const getOutgoingLinkEntityTypes = (params: {
  entityType: EntityType;
  queryResult: Subgraph<EntityRootType>;
}) => {
  const outgoingLinkEntityTypeIds = Object.keys(
    params.entityType.links ?? {},
  ) as VersionedUrl[];

  /** @todo: account for inherited links */

  return outgoingLinkEntityTypeIds.flatMap(
    (linkEntityTypeId) =>
      getEntityTypeById(params.queryResult, linkEntityTypeId)?.schema ?? [],
  );
};

const getIncomingLinkEntityTypes = (params: {
  queryResult: Subgraph<EntityRootType>;
}) => {
  const { queryResult } = params;
  const entities = getRoots(queryResult);

  return entities
    .flatMap(({ metadata }) =>
      getIncomingLinksForEntity(queryResult, metadata.recordId.entityId),
    )
    .map((linkEntity) => linkEntity.metadata.entityTypeId)
    .filter((linkEntityTypeId, i, all) => all.indexOf(linkEntityTypeId) === i)
    .flatMap((linkEntityTypeId) => {
      const linkEntityType = getEntityTypeById(queryResult, linkEntityTypeId);

      return linkEntityType?.schema ?? [];
    });
};

export const generateInitialChartDefinition = (params: {
  queryResult: Subgraph<EntityRootType>;
}): BarChartCountLinkedEntitiesVariant | undefined => {
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

  const labelPropertyType = resultPropertyTypeWithTextValue ?? propertyTypes[0];

  if (!labelPropertyType) {
    return undefined;
  }

  const outgoingLinkEntityTypes = getOutgoingLinkEntityTypes({
    entityType,
    queryResult,
  });

  let linkEntityType = outgoingLinkEntityTypes[0];

  let direction: "incoming" | "outgoing" = "outgoing";

  if (!linkEntityType) {
    const incomingLinkEntityTypes = getIncomingLinkEntityTypes({
      queryResult,
    });

    linkEntityType = incomingLinkEntityTypes[0];
    direction = "incoming";

    if (!linkEntityType) {
      return undefined;
    }
  }

  return {
    variant: "count-links",
    entityTypeId: entityType.$id,
    labelPropertyTypeId: labelPropertyType.$id,
    direction,
    linkEntityTypeId: linkEntityType.$id,
    xAxisLabel: generateXAxisLabel({
      entityType,
    }),
    yAxisLabel: generateYAxisLabel({
      linkEntityType,
      direction: "outgoing",
    }),
  };
};

export const CountLinksForm: FunctionComponent<{
  queryResult: Subgraph<EntityRootType>;
  entityTypes: EntityType[];
}> = ({ entityTypes, queryResult }) => {
  const { control, watch, register, setValue } =
    useFormContext<ChartDefinition<"bar-chart">>();

  const entityTypeId = watch("entityTypeId");

  const entityType = useMemo(
    () =>
      /** @todo: figure out why react hook form makes this always defined */
      (entityTypeId as ParseVersionedUrlError | "") !== ""
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

  const outgoingLinkEntityTypes = useMemo(() => {
    if (entityType) {
      return getOutgoingLinkEntityTypes({
        entityType,
        queryResult,
      });
    }
  }, [entityType, queryResult]);

  const incomingLinkEntityTypes = useMemo(
    () =>
      getIncomingLinkEntityTypes({
        queryResult,
      }),
    [queryResult],
  );

  const direction = watch("direction");

  const linkEntityTypes =
    direction === "incoming"
      ? incomingLinkEntityTypes
      : outgoingLinkEntityTypes;

  const linkEntityTypeId = watch("linkEntityTypeId");

  const regenerateYAxisLabel = useCallback(
    (params: {
      linkEntityTypeId?: VersionedUrl;
      direction?: "incoming" | "outgoing";
    }) => {
      const linkEntityType = linkEntityTypes?.find(
        ({ $id }) => $id === (params.linkEntityTypeId ?? linkEntityTypeId),
      );

      if (linkEntityType) {
        setValue(
          "yAxisLabel",
          generateYAxisLabel({
            linkEntityType,
            direction: params.direction ?? direction,
          }),
        );
      }
    },
    [linkEntityTypes, linkEntityTypeId, direction, setValue],
  );

  return (
    <>
      <Controller
        control={control}
        name={"labelPropertyTypeId"}
        disabled={!entityTypePropertyTypes}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id={"label-property-type"}>
              Label Property Type
            </InputLabel>
            <Select
              {...field}
              // prevent MUI from logging a warning
              required
              value={entityTypePropertyTypes ? field.value : ""}
              labelId={"label-property-type"}
              label={"Label Property Type"}
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
      <Controller
        control={control}
        name={"direction"}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id={"link-direction"}>Link Direction</InputLabel>
            <Select
              {...field}
              required
              labelId={"label-property-type"}
              label={"Label Property Type"}
              onChange={(event) => {
                regenerateYAxisLabel({
                  direction: event.target.value as "incoming" | "outgoing",
                });
                field.onChange(event);
              }}
            >
              <MenuItem value={"incoming"}>Incoming</MenuItem>
              <MenuItem value={"outgoing"}>Outgoing</MenuItem>
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name={"linkEntityTypeId"}
        disabled={!linkEntityTypes}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id={"link-entity-type-id"}>
              {direction === "incoming" ? "Incoming" : "Outgoing"} Link Entity
              Type
            </InputLabel>
            <Select
              {...field}
              // prevent MUI from logging a warning
              required
              value={linkEntityTypes ? field.value : ""}
              labelId={"link-entity-type-id"}
              label={"Link Entity Type"}
              onChange={(event) => {
                regenerateYAxisLabel({
                  linkEntityTypeId: event.target.value as VersionedUrl,
                });

                field.onChange(event);
              }}
            >
              {linkEntityTypes?.map(({ $id, title }) => (
                <MenuItem key={$id} value={$id}>
                  {title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <TextField
        fullWidth
        id={"x-axis-label"}
        label={"X Axis Label"}
        {...register("xAxisLabel")}
      />
      <TextField
        fullWidth
        id={"y-axis-label"}
        label={"Y Axis Label"}
        {...register("yAxisLabel")}
      />
    </>
  );
};
