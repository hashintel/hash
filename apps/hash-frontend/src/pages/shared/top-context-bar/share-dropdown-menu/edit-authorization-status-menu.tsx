import { MutationHookOptions, useMutation } from "@apollo/client";
import { Entity } from "@local/hash-subgraph";
import {
  Box,
  buttonClasses,
  ListItemIcon,
  listItemIconClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  styled,
  Tooltip,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback, useMemo } from "react";

import {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  AuthorizationSubjectKind,
  RemoveEntityViewerMutation,
  RemoveEntityViewerMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  addEntityViewerMutation,
  getEntityAuthorizationRelationshipsQuery,
  removeEntityViewerMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { ChevronDownRegularIcon } from "../../../../shared/icons/chevron-down-regular-icon";
import { GlobeRegularIcon } from "../../../../shared/icons/globe-regular-icon";
import { LockRegularIcon } from "../../../../shared/icons/lock-regular-icon";
import { PersonBoothRegularIcon } from "../../../../shared/icons/person-booth-regular-icon";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { Button, MenuItem } from "../../../../shared/ui";

const PrivacyStatusMenuItem = styled(MenuItem)(({ theme }) => ({
  [`&.${menuItemClasses.disabled}`]: {
    opacity: 1,
  },
  [`&.${menuItemClasses.selected}`]: {
    backgroundColor: theme.palette.gray[20],
    [`& .${listItemIconClasses.root}`]: {
      color: theme.palette.gray[50],
    },
    [`& .${listItemTextClasses.primary}`]: {
      color: theme.palette.gray[80],
    },
    [`& .${listItemTextClasses.secondary}`]: {
      color: theme.palette.gray[70],
    },
  },
}));

export type EntityAuthorizationStatus =
  | "public"
  | "shared-with-others"
  | "private";

export const entityAuthorizationStatusIcons = {
  public: <GlobeRegularIcon />,
  "shared-with-others": <PersonBoothRegularIcon />,
  private: <LockRegularIcon />,
} as const;

export const EditAuthorizationStatusMenu: FunctionComponent<{
  entity: Entity;
  authorizationStatus: EntityAuthorizationStatus;
  isSharedWithOthers?: boolean;
}> = ({ entity, authorizationStatus, isSharedWithOthers }) => {
  const privacyStatusPopupState = usePopupState({
    variant: "popover",
    popupId: "privacy-status-dropdown-menu",
  });

  const { entityId } = entity.metadata.recordId;

  const refetchQueries = useMemo<MutationHookOptions["refetchQueries"]>(
    () => [
      {
        query: getEntityAuthorizationRelationshipsQuery,
        variables: { entityId },
      },
    ],
    [entityId],
  );

  const [addEntityViewer, { loading: loadingAddEntityViewer }] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation, { refetchQueries });

  const [removeEntityViewer, { loading: loadingRemoveEntityViewer }] =
    useMutation<
      RemoveEntityViewerMutation,
      RemoveEntityViewerMutationVariables
    >(removeEntityViewerMutation, { refetchQueries });

  const removePublicViewer = useCallback(async () => {
    await removeEntityViewer({
      variables: {
        entityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });
    privacyStatusPopupState.close();
  }, [removeEntityViewer, entityId, privacyStatusPopupState]);

  const addPublicViewer = useCallback(async () => {
    await addEntityViewer({
      variables: {
        entityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });
    privacyStatusPopupState.close();
  }, [addEntityViewer, entityId, privacyStatusPopupState]);

  const loading = loadingAddEntityViewer || loadingRemoveEntityViewer;

  const menuItems = useMemo<
    {
      label: string;
      status: EntityAuthorizationStatus;
      description: string;
      disabled: boolean;
      tooltipText?: string;
      onClick: () => void;
    }[]
  >(() => {
    const isPageEntity = isEntityPageEntity(entity);

    return [
      {
        label: "Private",
        status: "private" as const,
        description: "Only you have access",
        disabled:
          loading ||
          authorizationStatus === "private" ||
          authorizationStatus === "shared-with-others",
        tooltipText:
          authorizationStatus === "shared-with-others"
            ? `To make this ${
                isPageEntity ? "page" : "entity"
              } private remove the members/webs it has been shared with`
            : undefined,
        onClick: removePublicViewer,
      },
      isSharedWithOthers
        ? {
            label: "Shared with others",
            status: "shared-with-others" as const,
            description: "You, people invited and anyone with a share link",
            disabled: loading || authorizationStatus === "shared-with-others",
            onClick: removePublicViewer,
          }
        : [],
      {
        label: "Public",
        status: "public" as const,
        description: "Discoverable and accessible by anyone",
        disabled: loading || authorizationStatus === "public",
        onClick: addPublicViewer,
      },
    ].flat();
  }, [
    isSharedWithOthers,
    authorizationStatus,
    loading,
    removePublicViewer,
    addPublicViewer,
    entity,
  ]);

  return (
    <>
      <Button
        size="xs"
        variant="tertiary"
        sx={{
          position: "absolute",
          right: ({ spacing }) => spacing(2),
          top: -(34 / 2) - 1,
          borderRadius: "30px",
          borderColor: ({ palette }) => palette.gray[30],
          background: ({ palette }) => palette.gray[20],
          color: ({ palette }) => palette.gray[80],
          fontSize: 14,
          fontWeight: 600,
          [`& .${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
            transition: ({ transitions }) => transitions.create("color"),
          },
        }}
        startIcon={entityAuthorizationStatusIcons[authorizationStatus]}
        endIcon={<ChevronDownRegularIcon />}
        {...bindTrigger(privacyStatusPopupState)}
      >
        {authorizationStatus === "private"
          ? "Private"
          : authorizationStatus === "public"
          ? "Public"
          : "Shared with others"}
      </Button>
      <Menu {...bindMenu(privacyStatusPopupState)}>
        {menuItems.map(
          ({ label, status, disabled, tooltipText, onClick, description }) => {
            const content = (
              <PrivacyStatusMenuItem
                key={status}
                disabled={disabled}
                selected={status === authorizationStatus}
                onClick={onClick}
                title={tooltipText}
              >
                <ListItemIcon>
                  {entityAuthorizationStatusIcons[status]}
                </ListItemIcon>
                <ListItemText primary={label} secondary={description} />
              </PrivacyStatusMenuItem>
            );

            return tooltipText ? (
              <Tooltip key={status} title={tooltipText}>
                <Box>{content}</Box>
              </Tooltip>
            ) : (
              content
            );
          },
        )}
      </Menu>
    </>
  );
};
