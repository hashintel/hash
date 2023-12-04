import {
  EntityRootType,
  EntityType,
  ParseVersionedUrlError,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import { getEntityTypeById } from "@blockprotocol/graph/stdlib";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { FunctionComponent, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { ChartDefinition } from "../../types/chart-definition";
import { getEntityTypePropertyTypes } from "../util";

const generateYAxisLabel = (params: { linkEntityType: EntityType }) =>
  `Number of ${params.linkEntityType.title.toLowerCase()} links`;

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

  const direction = watch("direction");

  const linkEntityTypes =
    direction === "incoming" ? [] : outgoingLinkEntityTypes;

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
                const linkEntityType = linkEntityTypes?.find(
                  ({ $id }) => $id === event.target.value,
                );

                if (linkEntityType) {
                  setValue(
                    "yAxisLabel",
                    generateYAxisLabel({ linkEntityType }),
                  );
                }

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
