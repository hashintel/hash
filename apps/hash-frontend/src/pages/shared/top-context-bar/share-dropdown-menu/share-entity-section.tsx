import { useMutation, useQuery } from "@apollo/client";
import { Avatar } from "@hashintel/design-system";
import { AuthorizationSubjectKind } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { AccountGroupId, AccountId, Entity } from "@local/hash-subgraph";
import { Box, Skeleton, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useOrgsWithLinks } from "../../../../components/hooks/use-orgs-with-links";
import { useUsersWithLinks } from "../../../../components/hooks/use-users-with-links";
import {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  GetEntityAuthorizationRelationshipsQuery,
  GetEntityAuthorizationRelationshipsQueryVariables,
} from "../../../../graphql/api-types.gen";
import {
  addEntityViewerMutation,
  getEntityAuthorizationRelationshipsQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { MinimalOrg, MinimalUser } from "../../../../lib/user-and-org";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { getImageUrlFromEntityProperties } from "../../get-image-url-from-properties";
import { InviteAccountForm } from "./invite-account-form";

type AuthorizationRelationship =
  GetEntityAuthorizationRelationshipsQuery["getEntityAuthorizationRelationships"][number];

type AuthorizationAccountRelationship = Omit<
  AuthorizationRelationship,
  "subject"
> & {
  subject: Exclude<
    AuthorizationRelationship["subject"],
    { __typename: "PublicAuthorizationSubject" }
  >;
};

export const ShareEntitySection: FunctionComponent<{ entity: Entity }> = ({
  entity,
}) => {
  const { entityId } = entity.metadata.recordId;

  const { data } = useQuery<
    GetEntityAuthorizationRelationshipsQuery,
    GetEntityAuthorizationRelationshipsQueryVariables
  >(getEntityAuthorizationRelationshipsQuery, {
    variables: { entityId },
  });

  const authorizationAccountRelationships = useMemo(() => {
    return (
      data?.getEntityAuthorizationRelationships
        // Filter out the public relationship if it exists
        .filter(
          (relationship): relationship is AuthorizationAccountRelationship =>
            relationship.subject.__typename === "AccountAuthorizationSubject" ||
            relationship.subject.__typename ===
              "AccountGroupAuthorizationSubject",
        )
    );
  }, [data]);

  const [addEntityViewer] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation, {
    refetchQueries: () => [
      {
        query: getEntityAuthorizationRelationshipsQuery,
        variables: { entityId },
      },
    ],
  });

  const handleInviteAccount = useCallback(
    async (account: MinimalOrg | MinimalUser) => {
      await addEntityViewer({
        variables: {
          entityId: entity.metadata.recordId.entityId,
          viewer: {
            kind:
              account.kind === "org"
                ? AuthorizationSubjectKind.Account
                : AuthorizationSubjectKind.AccountGroup,
            viewer:
              account.kind === "user"
                ? account.accountId
                : account.accountGroupId,
          },
        },
      });
    },
    [addEntityViewer, entity],
  );

  const sharedWithUserAccountIds = useMemo(
    () =>
      authorizationAccountRelationships?.reduce<AccountId[]>(
        (acc, { subject }) =>
          subject.__typename === "AccountAuthorizationSubject"
            ? [...acc, subject.accountId]
            : acc,
        [],
      ),
    [authorizationAccountRelationships],
  );

  const sharedWithOrgAccountGroupIds = useMemo(
    () =>
      authorizationAccountRelationships?.reduce<AccountGroupId[]>(
        (acc, { subject }) =>
          subject.__typename === "AccountGroupAuthorizationSubject"
            ? [...acc, subject.accountGroupId]
            : acc,
        [],
      ),
    [authorizationAccountRelationships],
  );

  const { users } = useUsersWithLinks({
    userAccountIds: sharedWithUserAccountIds,
  });

  const { orgs } = useOrgsWithLinks({
    orgAccountGroupIds: sharedWithOrgAccountGroupIds,
  });

  return (
    <>
      <Typography
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 0.75,
        }}
      >
        Share this {isEntityPageEntity(entity) ? "page" : "entity"}
      </Typography>
      <InviteAccountForm
        excludeAccountIds={authorizationAccountRelationships?.map(
          ({ subject }) =>
            subject.__typename === "AccountAuthorizationSubject"
              ? subject.accountId
              : subject.accountGroupId,
        )}
        onInviteAccount={handleInviteAccount}
      />
      <Box marginTop={1.5}>
        {authorizationAccountRelationships ? (
          authorizationAccountRelationships.map(({ subject }) => {
            const account =
              subject.__typename === "AccountAuthorizationSubject"
                ? users?.find((user) => user.accountId === subject.accountId)
                : orgs?.find(
                    (org) => org.accountGroupId === subject.accountGroupId,
                  );

            if (!account) {
              return (
                <Skeleton
                  key={
                    subject.__typename === "AccountAuthorizationSubject"
                      ? subject.accountId
                      : subject.accountGroupId
                  }
                />
              );
            }

            const avatarSrc = account.hasAvatar
              ? getImageUrlFromEntityProperties(
                  account.hasAvatar.imageEntity.properties,
                )
              : undefined;

            const accountName =
              account.kind === "user" ? account.preferredName : account.name;

            return (
              <Box
                key={
                  subject.__typename === "AccountAuthorizationSubject"
                    ? subject.accountId
                    : subject.accountGroupId
                }
                display="flex"
                alignItems="center"
                paddingY={1}
              >
                <Avatar
                  src={avatarSrc}
                  title={accountName}
                  size={28}
                  sx={{ marginRight: 1 }}
                />
                <Box flexGrow={1}>
                  <Typography variant="microText">{accountName}</Typography>
                </Box>
              </Box>
            );
          })
        ) : (
          <Skeleton />
        )}
      </Box>
    </>
  );
};
