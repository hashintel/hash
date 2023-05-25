import { useLazyQuery } from "@apollo/client";
import {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "@apps/hash-frontend/src/graphql/api-types.gen";
import { queryEntityTypesQuery } from "@apps/hash-frontend/src/graphql/queries/ontology/entity-type.queries";
import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";
import { getEntityTypes } from "@local/hash-subgraph/stdlib";

import { useReadonlyContext } from "../../readonly-context";
import { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";

export const EntityTypeSelector = ({ index }: { index: number }) => {
  const { control, formState } = useFormContext<FormValues>();
  const readonly = useReadonlyContext();

  const hasError = !!formState.errors.filters?.[index]?.value;

  const [
    queryEntityTypes,
    { data: entityTypesResponse, loading: entityTypesLoading },
  ] = useLazyQuery<QueryEntityTypesQuery, QueryEntityTypesQueryVariables>(
    queryEntityTypesQuery,
    {
      fetchPolicy: "cache-first",
      variables: {
        // @todo check these
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsLinksOn: { outgoing: 1 },
        constrainsLinkDestinationsOn: { outgoing: 1 },
      },
    },
  );

  const entityTypes = entityTypesResponse?.queryEntityTypes
    ? getEntityTypes(entityTypesResponse.queryEntityTypes).map(
        (type) => type.schema,
      )
    : [];

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{ required: "Required" }}
        defaultValue=""
        name={`filters.${index}.value`}
        selectProps={{
          size: "xs",
          displayEmpty: true,
          error: hasError,
          disabled: readonly,
          onOpen: () => queryEntityTypes(),
        }}
      >
        <MenuItem value="" disabled noSelectBackground>
          Choose
        </MenuItem>
        {entityTypesLoading ? (
          <MenuItem disabled>Loading…</MenuItem>
        ) : (
          entityTypes.map(({ title, $id }) => (
            <MenuItem key={$id} value={$id}>
              {title}
            </MenuItem>
          ))
        )}
      </RHFSelect>
    </FormControl>
  );
};
