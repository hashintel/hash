import { useMutation, useQuery } from "@apollo/client";
import { Entity } from "@local/hash-subgraph";
import {
  Box,
  buttonClasses,
  Divider,
  ListItemIcon,
  listItemIconClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  Popover,
  styled,
  Typography,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback } from "react";

import {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  AuthorizationSubjectKind,
  IsEntityPublicQuery,
  IsEntityPublicQueryVariables,
  RemoveEntityViewerMutation,
  RemoveEntityViewerMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  addEntityViewerMutation,
  isEntityPublicQuery,
  removeEntityViewerMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { ChevronDownRegularIcon } from "../../../shared/icons/chevron-down-regular-icon";
import { GlobeRegularIcon } from "../../../shared/icons/globe-regular-icon";
import { LockRegularIcon } from "../../../shared/icons/lock-regular-icon";
import { Button, MenuItem } from "../../../shared/ui";
import { ShareEntitySection } from "./share-dropdown-menu/share-entity-section";

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

const EditPrivacyStatusMenu: FunctionComponent<{
  entity: Entity;
  isEntityPublic?: boolean;
}> = ({ isEntityPublic, entity }) => {
  const privacyStatusPopupState = usePopupState({
    variant: "popover",
    popupId: "privacy-status-dropdown-menu",
  });

  const { entityId } = entity.metadata.recordId;

  const [addEntityViewer, { loading: loadingAddEntityViewer }] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation, {
    refetchQueries: () => [
      {
        query: isEntityPublicQuery,
        variables: { entityId },
      },
    ],
  });

  const [removeEntityViewer, { loading: loadingRemoveEntityViewer }] =
    useMutation<
      RemoveEntityViewerMutation,
      RemoveEntityViewerMutationVariables
    >(removeEntityViewerMutation, {
      refetchQueries: () => [
        {
          query: isEntityPublicQuery,
          variables: { entityId },
        },
      ],
    });

  const setEntityToPrivate = useCallback(async () => {
    await removeEntityViewer({
      variables: {
        entityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });
    privacyStatusPopupState.close();
  }, [removeEntityViewer, entityId, privacyStatusPopupState]);

  const setEntityToPublic = useCallback(async () => {
    await addEntityViewer({
      variables: {
        entityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });
    privacyStatusPopupState.close();
  }, [addEntityViewer, entityId, privacyStatusPopupState]);

  const loading = loadingAddEntityViewer || loadingRemoveEntityViewer;

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
        startIcon={isEntityPublic ? <GlobeRegularIcon /> : <LockRegularIcon />}
        endIcon={<ChevronDownRegularIcon />}
        {...bindTrigger(privacyStatusPopupState)}
      >
        {isEntityPublic ? "Public" : "Private"}
      </Button>
      <Menu {...bindMenu(privacyStatusPopupState)}>
        <PrivacyStatusMenuItem
          disabled={loading || !isEntityPublic}
          selected={!isEntityPublic}
          onClick={setEntityToPrivate}
        >
          <ListItemIcon>
            <LockRegularIcon />
          </ListItemIcon>
          <ListItemText primary="Private" secondary="Only you have access" />
        </PrivacyStatusMenuItem>
        <PrivacyStatusMenuItem
          disabled={loading || isEntityPublic}
          selected={isEntityPublic}
          onClick={setEntityToPublic}
        >
          <ListItemIcon>
            <GlobeRegularIcon />
          </ListItemIcon>
          <ListItemText
            primary="Public"
            secondary="Discoverable and accessible by anyone"
          />
        </PrivacyStatusMenuItem>
      </Menu>
    </>
  );
};

export const ShareDropdownMenu: FunctionComponent<{ entity: Entity }> = ({
  entity,
}) => {
  const { data } = useQuery<IsEntityPublicQuery, IsEntityPublicQueryVariables>(
    isEntityPublicQuery,
    {
      variables: {
        entityId: entity.metadata.recordId.entityId,
      },
    },
  );

  const popupState = usePopupState({
    variant: "popover",
    popupId: "share-dropdown-menu",
  });

  const { isEntityPublic } = data ?? {};

  return (
    <>
      <Button
        startIcon={
          typeof isEntityPublic === "undefined" ? null : isEntityPublic ? (
            <GlobeRegularIcon />
          ) : (
            <LockRegularIcon />
          )
        }
        size="xs"
        variant="tertiary_quiet"
        {...bindTrigger(popupState)}
      >
        Share
      </Button>
      <Popover
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            elevation: 4,
            sx: {
              width: 400,
              borderRadius: "6px",
              marginTop: 1,
              border: ({ palette }) => `1px solid ${palette.gray["20"]}`,
            },
          },
        }}
      >
        <Box paddingX={2} paddingY={1}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[50],
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            Permissions
          </Typography>
        </Box>
        <Divider sx={{ borderColor: ({ palette }) => palette.gray[30] }} />
        <Box position="relative" padding={2}>
          <EditPrivacyStatusMenu
            isEntityPublic={isEntityPublic}
            entity={entity}
          />
          <ShareEntitySection entity={entity} />
        </Box>
      </Popover>
    </>
  );
};
