import { MutationHookOptions, useMutation } from "@apollo/client";
import { Avatar } from "@hashintel/design-system";
import { Entity } from "@local/hash-subgraph";
import {
  Box,
  buttonClasses,
  Divider,
  dividerClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  Typography,
} from "@mui/material";
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
import { GlobeLightIcon } from "../../../../shared/icons/globe-light-icon";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../auth-info-context";
import { getImageUrlFromEntityProperties } from "../../get-image-url-from-properties";
import { PrivacyStatusMenuItem } from "./privacy-menu-item";
import { AuthorizationRelationship } from "./types";

const relationHierarchy: Record<EntityAuthorizationRelation, number> = {
  Owner: 3,
  Editor: 2,
  Viewer: 1,
};

const relationLabels: Record<EntityAuthorizationRelation, string> = {
  Owner: "Owner",
  Editor: "Can edit",
  Viewer: "Can view",
};

export const EditableAuthorizationRelationships: FunctionComponent<{
  objectEntity: Entity;
  account?: User | Org;
  relationships: AuthorizationRelationship[];
}> = ({ objectEntity, account, relationships }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const primaryRelationship = useMemo(
    () =>
      relationships.reduce<AuthorizationRelationship>((prev, current) => {
        if (
          relationHierarchy[current.relation] > relationHierarchy[prev.relation]
        ) {
          return current;
        }

        return prev;
      }, relationships[0]!),
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
      : subject.__typename === "AccountGroupAuthorizationSubject"
        ? subject.accountGroupId
        : "public";

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
    async (relationship: AuthorizationRelationship) => {
      const relationshipSubjectId =
        relationship.subject.__typename === "AccountAuthorizationSubject"
          ? relationship.subject.accountId
          : relationship.subject.__typename ===
              "AccountGroupAuthorizationSubject"
            ? relationship.subject.accountGroupId
            : undefined;

      if (relationship.relation === EntityAuthorizationRelation.Viewer) {
        await removeEntityViewer({
          variables: {
            entityId: relationship.objectEntityId,
            viewer: {
              viewer: relationshipSubjectId,
              kind:
                relationship.subject.__typename ===
                "AccountAuthorizationSubject"
                  ? AuthorizationSubjectKind.Account
                  : relationship.subject.__typename ===
                      "AccountGroupAuthorizationSubject"
                    ? AuthorizationSubjectKind.AccountGroup
                    : AuthorizationSubjectKind.Public,
            },
          },
        });
      }

      if (relationshipSubjectId) {
        if (relationship.relation === EntityAuthorizationRelation.Owner) {
          await removeEntityOwner({
            variables: {
              entityId: relationship.objectEntityId,
              owner: relationshipSubjectId,
            },
          });
        } else if (
          relationship.relation === EntityAuthorizationRelation.Editor
        ) {
          await removeEntityEditor({
            variables: {
              entityId: relationship.objectEntityId,
              editor: relationshipSubjectId,
            },
          });
        }
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
      if (currentRelation === updatedRelation || subjectId === "public") {
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

  const avatarSrc = account?.hasAvatar
    ? getImageUrlFromEntityProperties(account.hasAvatar.imageEntity.properties)
    : undefined;

  const name = account
    ? account.kind === "user"
      ? account.preferredName
      : account.name
    : "Public";

  const dropdownItems = useMemo(() => {
    if (subjectId === "public") {
      return [];
    }

    const isObjectPageEntity = isEntityPageEntity(objectEntity);

    return [
      {
        relation: EntityAuthorizationRelation.Viewer,
        label: relationLabels[EntityAuthorizationRelation.Viewer],
        description: `Can view this ${isObjectPageEntity ? "page" : "entity"}`,
      },
      {
        relation: EntityAuthorizationRelation.Editor,
        label: relationLabels[EntityAuthorizationRelation.Editor],
        description: `Can view, comment and edit this ${
          isObjectPageEntity ? "page" : "entity"
        }`,
      },
    ];
  }, [objectEntity, subjectId]);

  return (
    <Box display="flex" alignItems="center" paddingY={0.25}>
      <Box
        minWidth={28}
        display="flex"
        alignItems="center"
        justifyContent="center"
        marginRight={1}
      >
        {account ? (
          <Avatar
            src={avatarSrc}
            title={name}
            size={28}
            borderRadius={account.kind === "org" ? "4px" : undefined}
          />
        ) : (
          <GlobeLightIcon
            sx={{ fontSize: 18, color: ({ palette }) => palette.gray[50] }}
          />
        )}
      </Box>
      <Box flexGrow={1} display="flex" columnGap={1}>
        <Typography variant="microText" sx={{ fontWeight: 500, fontSize: 14 }}>
          {name}
        </Typography>
        {account &&
        account.kind === "user" &&
        account.accountId === authenticatedUser.accountId ? (
          <Typography variant="microText" sx={{ fontSize: 13 }}>
            (You)
          </Typography>
        ) : null}
      </Box>
      <Box minWidth={125}>
        <Button
          size="xs"
          variant="tertiary_quiet"
          endIcon={<ChevronDownRegularIcon sx={{ fontSize: 10 }} />}
          disabled={primaryRelationship.relation === "Owner"}
          sx={{
            color: ({ palette }) => palette.gray[80],
            [`&.${buttonClasses.disabled}`]: {
              color: ({ palette }) => palette.gray[80],
              background: "transparent",
              borderColor: "transparent",
              [`.${buttonClasses.endIcon}`]: {
                opacity: 0,
              },
            },
            [`.${buttonClasses.endIcon}`]: {
              fontSize: 10,
            },
          }}
          {...bindTrigger(popupState)}
        >
          {relationLabels[currentRelation]}
        </Button>
        <Menu
          {...bindMenu(popupState)}
          sx={{
            [`.${menuItemClasses.root}+.${dividerClasses.root}`]: {
              marginY: 0.5,
            },
          }}
        >
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
          {dropdownItems.length ? <Divider /> : null}
          <PrivacyStatusMenuItem
            onClick={async () => {
              await removeCurrentRelationships();
              popupState.close();
            }}
            sx={{
              [`.${listItemTextClasses.primary}`]: {
                fontWeight: 600,
                color: ({ palette }) => palette.red[70],
              },
              "&:hover": {
                [`.${listItemTextClasses.primary}`]: {
                  color: ({ palette }) => palette.red[70],
                },
              },
            }}
          >
            <ListItemText primary="Remove access" />
          </PrivacyStatusMenuItem>
        </Menu>
      </Box>
    </Box>
  );
};
