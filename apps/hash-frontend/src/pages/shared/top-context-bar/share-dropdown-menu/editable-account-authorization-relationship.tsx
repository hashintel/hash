import { MutationHookOptions, useMutation } from "@apollo/client";
import { Avatar } from "@hashintel/design-system";
import { Entity } from "@local/hash-subgraph/.";
import { Box, Divider, ListItemText, Menu, Typography } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback, useMemo } from "react";

import {
  AddEntityEditorMutation,
  AddEntityEditorMutationVariables,
  AddEntityOwnerMutation,
  AddEntityOwnerMutationVariables,
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  AuthorizationSubjectKind,
  EntityAuthorizationRelation,
  RemoveEntityEditorMutation,
  RemoveEntityEditorMutationVariables,
  RemoveEntityOwnerMutation,
  RemoveEntityOwnerMutationVariables,
  RemoveEntityViewerMutation,
  RemoveEntityViewerMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  addEntityEditorMutation,
  addEntityOwnerMutation,
  addEntityViewerMutation,
  getEntityAuthorizationRelationshipsQuery,
  removeEntityEditorMutation,
  removeEntityOwnerMutation,
  removeEntityViewerMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { Org, User } from "../../../../lib/user-and-org";
import { ChevronDownRegularIcon } from "../../../../shared/icons/chevron-down-regular-icon";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { Button } from "../../../../shared/ui";
import { getImageUrlFromEntityProperties } from "../../get-image-url-from-properties";
import { PrivacyStatusMenuItem } from "./privacy-menu-item";
import { AuthorizationRelationship } from "./types";

export type AccountAuthorizationRelationship = Omit<
  AuthorizationRelationship,
  "subject"
> & {
  subject: Exclude<
    AuthorizationRelationship["subject"],
    { __typename: "PublicAuthorizationSubject" }
  >;
};

const relationHierarchy: Record<EntityAuthorizationRelation, number> = {
  Owner: 3,
  Editor: 2,
  Viewer: 1,
};

export const EditableAccountAuthorizationRelationships: FunctionComponent<{
  objectEntity: Entity;
  account: User | Org;
  relationships: AccountAuthorizationRelationship[];
}> = ({ objectEntity, account, relationships }) => {
  const primaryRelationship = useMemo(
    () =>
      relationships.reduce<AccountAuthorizationRelationship>(
        (prev, current) => {
          if (
            relationHierarchy[current.relation] >
            relationHierarchy[prev.relation]
          ) {
            return current;
          }

          return prev;
        },
        relationships[0]!,
      ),
    [relationships],
  );

  const {
    objectEntityId,
    relation: currentRelation,
    subject,
  } = primaryRelationship;

  const subjectId =
    subject.__typename === "AccountAuthorizationSubject"
      ? subject.accountId
      : subject.accountGroupId;

  const popupState = usePopupState({
    variant: "popover",
    popupId: `${subjectId}-auth-dropdown-menu`,
  });

  const refetchQueries = useMemo<MutationHookOptions["refetchQueries"]>(
    () => [
      {
        query: getEntityAuthorizationRelationshipsQuery,
        variables: { entityId: objectEntityId },
      },
    ],
    [objectEntityId],
  );

  const [removeEntityOwner] = useMutation<
    RemoveEntityOwnerMutation,
    RemoveEntityOwnerMutationVariables
  >(removeEntityOwnerMutation, { refetchQueries });

  const [removeEntityEditor] = useMutation<
    RemoveEntityEditorMutation,
    RemoveEntityEditorMutationVariables
  >(removeEntityEditorMutation, { refetchQueries });

  const [removeEntityViewer] = useMutation<
    RemoveEntityViewerMutation,
    RemoveEntityViewerMutationVariables
  >(removeEntityViewerMutation, { refetchQueries });

  const removeRelationship = useCallback(
    async (relationship: AccountAuthorizationRelationship) => {
      const relationshipSubjectId =
        relationship.subject.__typename === "AccountAuthorizationSubject"
          ? relationship.subject.accountId
          : relationship.subject.accountGroupId;

      if (relationship.relation === EntityAuthorizationRelation.Owner) {
        await removeEntityOwner({
          variables: {
            entityId: relationship.objectEntityId,
            owner: relationshipSubjectId,
          },
        });
      } else if (relationship.relation === EntityAuthorizationRelation.Editor) {
        await removeEntityEditor({
          variables: {
            entityId: relationship.objectEntityId,
            editor: relationshipSubjectId,
          },
        });
      } else {
        await removeEntityViewer({
          variables: {
            entityId: relationship.objectEntityId,
            viewer: {
              viewer: relationshipSubjectId,
              kind:
                relationship.subject.__typename ===
                "AccountAuthorizationSubject"
                  ? AuthorizationSubjectKind.Account
                  : AuthorizationSubjectKind.AccountGroup,
            },
          },
        });
      }
    },
    [removeEntityViewer, removeEntityEditor, removeEntityOwner],
  );

  const removeCurrentRelationships = useCallback(async () => {
    await Promise.all(relationships.map(removeRelationship));
  }, [relationships, removeRelationship]);

  const [addEntityOwner] = useMutation<
    AddEntityOwnerMutation,
    AddEntityOwnerMutationVariables
  >(addEntityOwnerMutation, { refetchQueries });

  const [addEntityEditor] = useMutation<
    AddEntityEditorMutation,
    AddEntityEditorMutationVariables
  >(addEntityEditorMutation, { refetchQueries });

  const [addEntityViewer] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation, { refetchQueries });

  const updateAuthorizationRelation = useCallback(
    async (updatedRelation: EntityAuthorizationRelation) => {
      if (currentRelation === updatedRelation) {
        return;
      }

      if (updatedRelation === EntityAuthorizationRelation.Owner) {
        await addEntityOwner({
          variables: {
            entityId: objectEntityId,
            owner: subjectId,
          },
        });
      } else if (updatedRelation === EntityAuthorizationRelation.Editor) {
        await addEntityEditor({
          variables: {
            entityId: objectEntityId,
            editor: subjectId,
          },
        });
      } else {
        await addEntityViewer({
          variables: {
            entityId: objectEntityId,
            viewer: {
              viewer: subjectId,
              kind:
                subject.__typename === "AccountAuthorizationSubject"
                  ? AuthorizationSubjectKind.Account
                  : AuthorizationSubjectKind.AccountGroup,
            },
          },
        });
      }

      await removeCurrentRelationships();
    },
    [
      subjectId,
      currentRelation,
      addEntityEditor,
      removeCurrentRelationships,
      addEntityOwner,
      addEntityViewer,
      objectEntityId,
      subject,
    ],
  );

  const avatarSrc = account.hasAvatar
    ? getImageUrlFromEntityProperties(account.hasAvatar.imageEntity.properties)
    : undefined;

  const accountName =
    account.kind === "user" ? account.preferredName : account.name;

  const dropdownItems = useMemo(() => {
    const isObjectPageEntity = isEntityPageEntity(objectEntity);

    return [
      {
        relation: EntityAuthorizationRelation.Viewer,
        label: "Can view",
        description: `Can view this ${isObjectPageEntity ? "page" : "entity"}`,
      },
      {
        relation: EntityAuthorizationRelation.Editor,
        label: "Can edit",
        description: `Can view, comment and edit this ${
          isObjectPageEntity ? "page" : "entity"
        }`,
      },
    ];
  }, [objectEntity]);

  return (
    <Box display="flex" alignItems="center" paddingY={1}>
      <Avatar
        src={avatarSrc}
        title={accountName}
        size={28}
        sx={{ marginRight: 1 }}
      />
      <Box flexGrow={1}>
        <Typography variant="microText">{accountName}</Typography>
      </Box>
      <Box minWidth={125}>
        <Button
          size="xs"
          variant="tertiary"
          endIcon={<ChevronDownRegularIcon />}
          disabled={primaryRelationship.relation === "Owner"}
          {...bindTrigger(popupState)}
        >
          {primaryRelationship.relation}
        </Button>
        <Menu {...bindMenu(popupState)}>
          {dropdownItems.map(({ relation, label, description }) => (
            <PrivacyStatusMenuItem
              key={relation}
              selected={currentRelation === relation}
              disabled={currentRelation === relation}
              onClick={async () => {
                await updateAuthorizationRelation(relation);
                popupState.close();
              }}
            >
              <ListItemText primary={label} secondary={description} />
            </PrivacyStatusMenuItem>
          ))}
          <Divider />
          <PrivacyStatusMenuItem
            onClick={async () => {
              await removeCurrentRelationships();
              popupState.close();
            }}
          >
            <ListItemText primary="Remove access" />
          </PrivacyStatusMenuItem>
        </Menu>
      </Box>
    </Box>
  );
};
