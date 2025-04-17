import { useLazyQuery, useMutation } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  type ActorEntityUuid,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  createOrgMembershipAuthorizationRelationships,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box } from "@mui/material";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  AddAccountGroupMemberMutation,
  AddAccountGroupMemberMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { addAccountGroupMemberMutation } from "../../../../../graphql/queries/account-group.queries";
import {
  createEntityMutation,
  queryEntitiesQuery,
} from "../../../../../graphql/queries/knowledge/entity.queries";
import type { Org } from "../../../../../lib/user-and-org";
import { Button } from "../../../../../shared/ui/button";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";

export const AddMemberForm = ({ org }: { org: Org }) => {
  const [loading, setLoading] = useState(false);
  const [shortname, setShortname] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { refetch } = useAuthenticatedUser();

  const [addMemberPermission] = useMutation<
    AddAccountGroupMemberMutation,
    AddAccountGroupMemberMutationVariables
  >(addAccountGroupMemberMutation);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [queryEntities] = useLazyQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);

    if (
      org.memberships.find(
        (membership) => membership.user.shortname === shortname,
      )
    ) {
      setError("Already a member");
      setLoading(false);
      return;
    }

    const { data } = await queryEntities({
      variables: {
        includePermissions: false,
        operation: {
          multiFilter: {
            filters: [
              {
                field: [
                  "properties",
                  systemPropertyTypes.shortname.propertyTypeBaseUrl,
                ],
                value: shortname,
                operator: "EQUALS",
              },
            ],
            operator: "AND",
          },
        },
        ...zeroedGraphResolveDepths,
      },
    });

    if (!data) {
      setError("Unexpected error – please contact us");
      setLoading(false);
      return;
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
      EntityRootType<HashEntity>
    >(data.queryEntities.subgraph);

    const user = getRoots(subgraph)[0];

    if (!user) {
      setError("User not found");
      setLoading(false);
      return;
    }

    await Promise.all([
      createEntity({
        variables: {
          entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
          properties: { value: {} },
          linkData: {
            leftEntityId: user.metadata.recordId.entityId,
            rightEntityId: org.entity.metadata.recordId.entityId,
          },
          relationships: createOrgMembershipAuthorizationRelationships({
            memberAccountId: extractWebIdFromEntityId(
              user.metadata.recordId.entityId,
            ) as ActorEntityUuid,
          }),
        },
      }),
      addMemberPermission({
        variables: {
          accountGroupId: org.webId,
          accountId: extractWebIdFromEntityId(
            user.metadata.recordId.entityId,
          ) as ActorEntityUuid,
        },
      }),
    ]);

    void refetch();

    inputRef.current?.blur();

    setShortname("");
    setLoading(false);
  };

  return (
    <Box component="form" onSubmit={addMember}>
      <TextField
        autoComplete="off"
        error={!!error}
        helperText={error}
        id="shortname"
        inputRef={inputRef}
        inputProps={{
          sx: {
            borderColor: error ? "#FCA5A5" : "initial",
            "&:focus": {
              borderColor: error ? "#EF4444" : "initial",
            },
          },
        }}
        onChange={(evt) => {
          setError("");
          setShortname(evt.target.value.replace(/[^a-zA-Z0-9-_]/g, ""));
        }}
        placeholder="username"
        size="xs"
        value={shortname}
      />
      <Button
        disabled={loading}
        size="xs"
        sx={{ marginLeft: -1 }}
        type="submit"
      >
        {loading ? "Pending..." : "Add member"}
      </Button>
    </Box>
  );
};
