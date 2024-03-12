import { useQuery } from "@apollo/client";
import { Entity } from "@local/hash-subgraph";
import { Typography } from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { useOrgsWithLinks } from "../../../components/hooks/use-orgs-with-links";
import { useUsers } from "../../../components/hooks/use-users";
import {
  GetEntityAuthorizationRelationshipsQuery,
  GetEntityAuthorizationRelationshipsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getEntityAuthorizationRelationshipsQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { MinimalUser } from "../../../lib/user-and-org";

export const DraftEntityViewers: FunctionComponent<{
  entity: Entity;
}> = ({ entity }) => {
  const { data } = useQuery<
    GetEntityAuthorizationRelationshipsQuery,
    GetEntityAuthorizationRelationshipsQueryVariables
  >(getEntityAuthorizationRelationshipsQuery, {
    variables: { entityId: entity.metadata.recordId.entityId },
    fetchPolicy: "cache-and-network",
  });

  const authorizationRelationships = data?.getEntityAuthorizationRelationships;

  const { users } = useUsers();

  const { orgs: orgViewers } = useOrgsWithLinks({
    orgAccountGroupIds: authorizationRelationships
      ?.map(({ subject }) =>
        subject.__typename === "AccountGroupAuthorizationSubject"
          ? subject.accountGroupId
          : [],
      )
      .flat(),
  });

  const orgMemberViewers = useMemo(() => {
    if (orgViewers) {
      return orgViewers
        .map(({ memberships }) => memberships.map(({ user }) => user))
        .flat();
    }
  }, [orgViewers]);

  const userViewers = useMemo(() => {
    if (authorizationRelationships && users) {
      return authorizationRelationships.reduce<MinimalUser[]>(
        (prev, { subject }) => {
          if (subject.__typename === "AccountAuthorizationSubject") {
            const user = users.find(
              ({ accountId }) => accountId === subject.accountId,
            );

            if (
              user &&
              !prev.some(({ accountId }) => accountId === user.accountId)
            ) {
              return [...prev, user];
            }
          }

          return prev;
        },
        [],
      );
    }
  }, [authorizationRelationships, users]);

  const copy = useMemo(() => {
    if (authorizationRelationships) {
      if (
        authorizationRelationships.some(
          ({ subject }) => subject.__typename === "PublicAuthorizationSubject",
        )
      ) {
        return "Visible to anyone";
      }

      if (
        authorizationRelationships.length === 1 ||
        /**
         * @todo: remove this when the GQL resolver returns the correct number of authorization relationships
         *
         * @see https://linear.app/hash/issue/H-1115/use-permission-types-from-graph-in-graphql
         */
        authorizationRelationships.length === 0
      ) {
        return "Only visible to me";
      }

      if (userViewers && orgMemberViewers) {
        const viewers = [...userViewers, ...orgMemberViewers].filter(
          (viewer, index, all) =>
            all.findIndex(({ accountId }) => accountId === viewer.accountId) ===
            index,
        );

        return (
          <>
            Visible to <strong>{viewers.length} people</strong>
          </>
        );
      }
    }
  }, [authorizationRelationships, userViewers, orgMemberViewers]);

  return (
    <Typography
      sx={{
        color: ({ palette }) => palette.gray[70],
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {copy}
    </Typography>
  );
};
