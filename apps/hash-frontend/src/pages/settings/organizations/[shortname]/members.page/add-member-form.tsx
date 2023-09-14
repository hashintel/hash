import { useLazyQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityRootType, OwnedById, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { Org } from "../../../../../lib/user-and-org";
import { Button } from "../../../../../shared/ui/button";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";

const shortnameBaseUrl = extractBaseUrl(
  types.propertyType.shortname.propertyTypeId,
);

export const AddMemberForm = ({ org }: { org: Org }) => {
  const [loading, setLoading] = useState(false);
  const [shortname, setShortname] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { refetch } = useAuthenticatedUser();

  const { createEntity } = useBlockProtocolCreateEntity(
    org.accountGroupId as OwnedById,
  );
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
        operation: {
          multiFilter: {
            filters: [
              {
                field: ["properties", shortnameBaseUrl],
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

    const user = getRoots(data.queryEntities as Subgraph<EntityRootType>)[0];

    if (!user) {
      setError("User not found");
      setLoading(false);
      return;
    }

    await createEntity({
      data: {
        entityTypeId: types.linkEntityType.orgMembership.linkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: user.metadata.recordId.entityId,
          rightEntityId: org.entityRecordId.entityId,
        },
      },
    });

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
