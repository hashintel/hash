import {
  EntityRootType,
  EntityType,
  ParseVersionedUrlError,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import { getEntityTypeById, getRoots } from "@blockprotocol/graph/stdlib";
import { Subgraph as TemporalSubgraph } from "@blockprotocol/graph/temporal";
/** @todo: replace with the non-temporal equivalent method */
import { getIncomingLinksForEntity } from "@blockprotocol/graph/temporal/stdlib";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import pluralize from "pluralize";
import { FunctionComponent, useCallback, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { ChartDefinition } from "../../types/chart-definition";
import { getEntityTypePropertyTypes } from "../util";

export const generateXAxisLabel = (params: { entityType: EntityType }) =>
  `${pluralize(params.entityType.title)}`;

export const generateYAxisLabel = (params: {
  linkEntityType: EntityType;
  direction: "incoming" | "outgoing";
}) =>
  `Number of ${
    params.direction
  } ${params.linkEntityType.title.toLowerCase()} links`;

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
      const outgoingLinkEntityTypeIds = Object.keys(
        entityType.links ?? {},
      ) as VersionedUrl[];
      /** @todo: account for inherited links */

      return outgoingLinkEntityTypeIds
        .map(
          (linkEntityTypeId) =>
            getEntityTypeById(queryResult, linkEntityTypeId)?.schema ?? [],
        )
        .flat();
    }
  }, [entityType, queryResult]);

  const incomingLinkEntityTypes = useMemo(() => {
    if (entityType) {
      const entities = getRoots(queryResult);

      return entities
        .map(({ metadata }) =>
          getIncomingLinksForEntity(
            queryResult as unknown as TemporalSubgraph,
            metadata.recordId.entityId,
          ),
        )
        .flat()
        .map((linkEntity) => linkEntity.metadata.entityTypeId)
        .filter(
          (linkEntityTypeId, i, all) => all.indexOf(linkEntityTypeId) === i,
        )
        .map((linkEntityTypeId) => {
          const linkEntityType = getEntityTypeById(
            queryResult,
            linkEntityTypeId,
          );

          return linkEntityType?.schema ?? [];
        })
        .flat();
    }
  }, [entityType, queryResult]);

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
        name="labelPropertyTypeId"
        disabled={!entityTypePropertyTypes}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="label-property-type">
              Label Property Type
            </InputLabel>
            <Select
              {...field}
              // prevent MUI from logging a warning
              value={entityTypePropertyTypes ? field.value : ""}
              labelId="label-property-type"
              label="Label Property Type"
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
      <Controller
        control={control}
        name="direction"
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="link-direction">Link Direction</InputLabel>
            <Select
              {...field}
              onChange={(event) => {
                regenerateYAxisLabel({
                  direction: event.target.value as "incoming" | "outgoing",
                });
                field.onChange(event);
              }}
              labelId="label-property-type"
              label="Label Property Type"
              required
            >
              <MenuItem value="incoming">Incoming</MenuItem>
              <MenuItem value="outgoing">Outgoing</MenuItem>
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="linkEntityTypeId"
        disabled={!linkEntityTypes}
        render={({ field }) => (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="link-entity-type-id">
              {direction === "incoming" ? "Incoming" : "Outgoing"} Link Entity
              Type
            </InputLabel>
            <Select
              {...field}
              // prevent MUI from logging a warning
              value={linkEntityTypes ? field.value : ""}
              onChange={(event) => {
                regenerateYAxisLabel({
                  linkEntityTypeId: event.target.value as VersionedUrl,
                });

                field.onChange(event);
              }}
              labelId="link-entity-type-id"
              label="Link Entity Type"
              required
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
