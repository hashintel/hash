import { useLazyQuery, useMutation } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { TextField } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box } from "@mui/material";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  InviteUserToOrgMutation,
  InviteUserToOrgMutationVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { inviteUserToOrgMutation } from "../../../../../graphql/queries/knowledge/org.queries";
import type { Org } from "../../../../../lib/user-and-org";
import { Button } from "../../../../../shared/ui/button";

export const AddMemberForm = ({ org }: { org: Org }) => {
  const [loading, setLoading] = useState(false);
  const [shortname, setShortname] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [inviteUserToOrg] = useMutation<
    InviteUserToOrgMutation,
    InviteUserToOrgMutationVariables
  >(inviteUserToOrgMutation);

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

    await inviteUserToOrg({
      variables: {
        orgWebId: org.webId,
        userEmail: email,
        userShortname: shortname,
      },
    });

    inputRef.current?.blur();

    setShortname("");
    setEmail("");
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
