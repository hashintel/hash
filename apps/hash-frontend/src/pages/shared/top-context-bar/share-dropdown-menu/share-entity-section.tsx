import { useMutation } from "@apollo/client";
import { AuthorizationSubjectKind } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { AccountGroupId, AccountId, Entity } from "@local/hash-subgraph";
import { Box, Skeleton, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useOrgsWithLinks } from "../../../../components/hooks/use-orgs-with-links";
import { useUsersWithLinks } from "../../../../components/hooks/use-users-with-links";
import {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  EntityAuthorizationRelation,
} from "../../../../graphql/api-types.gen";
import {
  addEntityViewerMutation,
  getEntityAuthorizationRelationshipsQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import {
  MinimalOrg,
  MinimalUser,
  Org,
  User,
} from "../../../../lib/user-and-org";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { EditableAuthorizationRelationships } from "./editable-authorization-relationship";
import { InviteAccountForm } from "./invite-account-form";
import {
  AccountAuthorizationRelationship,
  AuthorizationRelationship,
  PublicAuthorizationRelationship,
} from "./types";

type AccountAuthorizationRelationshipsByAccount = {
  account: User | Org;
  relationships: AccountAuthorizationRelationship[];
};

export const ShareEntitySection: FunctionComponent<{
  entity: Entity;
  authorizationRelationships?: AuthorizationRelationship[];
}> = ({ entity, authorizationRelationships }) => {
  const { entityId } = entity.metadata.recordId;

  const accountAuthorizationRelationships = useMemo(
    () =>
      authorizationRelationships?.filter(
        (relationship): relationship is AccountAuthorizationRelationship =>
          relationship.subject.__typename === "AccountAuthorizationSubject" ||
          relationship.subject.__typename ===
            "AccountGroupAuthorizationSubject",
      ),
    [authorizationRelationships],
  );

  const publicAuthorizationRelationships = useMemo(
    () =>
      authorizationRelationships?.filter(
        (relationship): relationship is PublicAuthorizationRelationship =>
          relationship.subject.__typename === "PublicAuthorizationSubject",
      ),
    [authorizationRelationships],
  );

  const sharedWithUserAccountIds = useMemo(
    () =>
      accountAuthorizationRelationships?.reduce<AccountId[]>(
        (acc, { subject }) =>
          subject.__typename === "AccountAuthorizationSubject" &&
          !acc.includes(subject.accountId)
            ? [...acc, subject.accountId]
            : acc,
        [],
      ),
    [accountAuthorizationRelationships],
  );

  const sharedWithOrgAccountGroupIds = useMemo(
    () =>
      accountAuthorizationRelationships?.reduce<AccountGroupId[]>(
        (acc, { subject }) =>
          subject.__typename === "AccountGroupAuthorizationSubject" &&
          !acc.includes(subject.accountGroupId)
            ? [...acc, subject.accountGroupId]
            : acc,
        [],
      ),
    [accountAuthorizationRelationships],
  );

  const { users } = useUsersWithLinks({
    userAccountIds: sharedWithUserAccountIds,
  });

  const { orgs } = useOrgsWithLinks({
    orgAccountGroupIds: sharedWithOrgAccountGroupIds,
  });

  const accounts = useMemo(
    () => (users && orgs ? [...users, ...orgs] : undefined),
    [users, orgs],
  );

  const accountAuthorizationRelationshipsByAccount = useMemo(
    () =>
      accounts && accountAuthorizationRelationships
        ? // Group the relationships by subject
          accountAuthorizationRelationships.reduce<
            AccountAuthorizationRelationshipsByAccount[]
          >((acc, relationship) => {
            const subjectId =
              relationship.subject.__typename === "AccountAuthorizationSubject"
                ? relationship.subject.accountId
                : relationship.subject.accountGroupId;

            const existingAccountIndex = acc.findIndex(({ account }) =>
              account.kind === "user"
                ? account.accountId === subjectId
                : account.accountGroupId === subjectId,
            );

            if (existingAccountIndex !== -1) {
              acc[existingAccountIndex]!.relationships.push(relationship);
            } else {
              acc.push({
                account: accounts.find((account) =>
                  account.kind === "user"
                    ? account.accountId === subjectId
                    : account.accountGroupId === subjectId,
                )!,
                relationships: [relationship],
              });
            }

            return acc;
          }, [])
        : undefined,
    [accountAuthorizationRelationships, accounts],
  );

  const [addEntityViewer] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation, {
    refetchQueries: [
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
              account.kind === "user"
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

  const ownerAuthorizationRelationshipsByAccount = useMemo(
    () =>
      accountAuthorizationRelationshipsByAccount
        ?.filter(({ relationships }) =>
          relationships.some(
            ({ relation }) => relation === EntityAuthorizationRelation.Owner,
          ),
        )
        .sort((a, b) => {
          const aLabel =
            a.account.kind === "user"
              ? a.account.displayName ?? "Unknown"
              : a.account.name;
          const bLabel =
            b.account.kind === "user"
              ? b.account.displayName ?? "Unknown"
              : b.account.name;

          return aLabel.localeCompare(bLabel);
        }),
    [accountAuthorizationRelationshipsByAccount],
  );

  const nonOwnerAuthorizationRelationshipsByAccount = useMemo(
    () =>
      ownerAuthorizationRelationshipsByAccount &&
      accountAuthorizationRelationshipsByAccount
        ?.filter(
          ({ account }) =>
            !ownerAuthorizationRelationshipsByAccount.some(
              ({ account: ownerAccount }) =>
                ownerAccount.kind === account.kind &&
                (account.kind === "org"
                  ? (ownerAccount as Org).accountGroupId ===
                    account.accountGroupId
                  : (ownerAccount as User).accountId === account.accountId),
            ),
        )
        .sort((a, b) => {
          const aLabel =
            a.account.kind === "user"
              ? a.account.displayName ?? "Unknown"
              : a.account.name;
          const bLabel =
            b.account.kind === "user"
              ? b.account.displayName ?? "Unknown"
              : b.account.name;

          return aLabel.localeCompare(bLabel);
        }),
    [
      ownerAuthorizationRelationshipsByAccount,
      accountAuthorizationRelationshipsByAccount,
    ],
  );

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
        excludeAccountIds={[
          ...(sharedWithUserAccountIds ?? []),
          ...(sharedWithOrgAccountGroupIds ?? []),
        ]}
        onInviteAccount={handleInviteAccount}
      />
      <Box marginTop={1.5}>
        {accountAuthorizationRelationshipsByAccount ? (
          <>
            {ownerAuthorizationRelationshipsByAccount?.map(
              ({ account, relationships }) => (
                <EditableAuthorizationRelationships
                  objectEntity={entity}
                  key={
                    account.kind === "user"
                      ? account.accountId
                      : account.accountGroupId
                  }
                  account={account}
                  relationships={relationships}
                />
              ),
            )}
            {nonOwnerAuthorizationRelationshipsByAccount?.map(
              ({ account, relationships }) => (
                <EditableAuthorizationRelationships
                  objectEntity={entity}
                  key={
                    account.kind === "user"
                      ? account.accountId
                      : account.accountGroupId
                  }
                  account={account}
                  relationships={relationships}
                />
              ),
            )}
            {publicAuthorizationRelationships?.length ? (
              <EditableAuthorizationRelationships
                objectEntity={entity}
                relationships={publicAuthorizationRelationships}
              />
            ) : null}
          </>
        ) : (
          <Skeleton />
        )}
      </Box>
    </>
  );
};
