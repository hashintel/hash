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
import { Stack } from "@mui/material";
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
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";

export const AddMemberForm = ({ org }: { org: Org }) => {
  const [loading, setLoading] = useState(false);
  const [shortnameOrEmail, setShortnameOrEmail] = useState("");
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

  const { refetch: refetchAuthenticatedUser } = useAuthenticatedUser();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);

    const isEmail = shortnameOrEmail.includes("@");

    if (
      org.memberships.find(
        (membership) => membership.user.shortname === shortnameOrEmail,
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
                  isEmail
                    ? systemPropertyTypes.email.propertyTypeBaseUrl
                    : systemPropertyTypes.shortname.propertyTypeBaseUrl,
                ],
                value: shortnameOrEmail,
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

    if (!user && !isEmail) {
      setError(`User with shortname ${shortnameOrEmail} not found`);
      setLoading(false);
      return;
    }

    try {
      await inviteUserToOrg({
        variables: {
          orgWebId: org.webId,
          userEmail: isEmail ? shortnameOrEmail : undefined,
          userShortname: isEmail ? undefined : shortnameOrEmail,
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      return;
    }

    inputRef.current?.blur();

    setShortnameOrEmail("");
    setLoading(false);

    void refetchAuthenticatedUser();
  };

  return (
    <Stack gap={2} direction="row" component="form" onSubmit={addMember}>
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
          setShortnameOrEmail(evt.target.value);
        }}
        placeholder="Username or email..."
        size="xs"
        sx={{ width: 300 }}
        value={shortnameOrEmail}
      />
      <Button
        disabled={loading}
        size="xs"
        sx={{ marginLeft: -1, alignSelf: "flex-start" }}
        type="submit"
      >
        {loading ? "Pending..." : "Add member"}
      </Button>
    </Stack>
  );
};
