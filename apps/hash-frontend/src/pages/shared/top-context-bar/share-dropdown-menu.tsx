import { useQuery } from "@apollo/client";
import { Entity } from "@local/hash-subgraph";
import { Box, Divider, Popover, Typography } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useMemo } from "react";

import {
  EntityAuthorizationRelation,
  GetEntityAuthorizationRelationshipsQuery,
  GetEntityAuthorizationRelationshipsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getEntityAuthorizationRelationshipsQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { Button } from "../../../shared/ui";
import { useUserPermissionsOnEntity } from "../../../shared/use-user-permissions-on-entity";
import {
  EditAuthorizationStatusMenu,
  EntityAuthorizationStatus,
  entityAuthorizationStatusIcons,
} from "./share-dropdown-menu/edit-authorization-status-menu";
import { ShareEntitySection } from "./share-dropdown-menu/share-entity-section";

export const ShareDropdownMenu: FunctionComponent<{ entity: Entity }> = ({
  entity,
}) => {
  const { entityId } = entity.metadata.recordId;

  const { userPermissions } = useUserPermissionsOnEntity(entity);

  const { data } = useQuery<
    GetEntityAuthorizationRelationshipsQuery,
    GetEntityAuthorizationRelationshipsQueryVariables
  >(getEntityAuthorizationRelationshipsQuery, {
    variables: { entityId },
    fetchPolicy: "cache-and-network",
    skip: !userPermissions?.viewPermissions,
  });

  const authorizationRelationships = data?.getEntityAuthorizationRelationships;

  const isSharedWithOthers = useMemo(() => {
    const ownerSubjectIds = authorizationRelationships
      ?.filter(({ relation }) => relation === EntityAuthorizationRelation.Owner)
      .map(({ subject }) =>
        subject.__typename === "AccountAuthorizationSubject"
          ? subject.accountId
          : subject.__typename === "AccountGroupAuthorizationSubject"
            ? subject.accountGroupId
            : [],
      )
      .flat();

    return (
      ownerSubjectIds &&
      authorizationRelationships?.some(
        ({ subject }) =>
          subject.__typename !== "PublicAuthorizationSubject" &&
          !ownerSubjectIds.includes(
            subject.__typename === "AccountAuthorizationSubject"
              ? subject.accountId
              : subject.accountGroupId,
          ),
      )
    );
  }, [authorizationRelationships]);

  const entityAuthorizationStatus = useMemo<EntityAuthorizationStatus>(() => {
    const isPublic = authorizationRelationships?.some(
      ({ subject }) => subject.__typename === "PublicAuthorizationSubject",
    );

    if (isPublic) {
      return "public";
    }

    if (isSharedWithOthers) {
      return "shared-with-others";
    }

    return "private";
  }, [authorizationRelationships, isSharedWithOthers]);

  const popupState = usePopupState({
    variant: "popover",
    popupId: "share-dropdown-menu",
  });

  if (!userPermissions?.viewPermissions) {
    return null;
  }

  return (
    <>
      <Button
        startIcon={entityAuthorizationStatusIcons[entityAuthorizationStatus]}
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
          <EditAuthorizationStatusMenu
            entity={entity}
            authorizationStatus={entityAuthorizationStatus}
            isSharedWithOthers={isSharedWithOthers}
          />
          <ShareEntitySection
            entity={entity}
            authorizationRelationships={authorizationRelationships}
          />
        </Box>
      </Popover>
    </>
  );
};
