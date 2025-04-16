import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import type { WebId } from "@blockprotocol/type-system";
import { IconButton, PenRegularIcon } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, Skeleton, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { BlockLoadedProvider } from "../../../blocks/on-block-loaded";
import { UserBlocksProvider } from "../../../blocks/user-blocks";
import { useBlockProtocolCreateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import type { Org, User } from "../../../lib/user-and-org";
import { CheckRegularIcon } from "../../../shared/icons/check-regular-icon";
import { GlobeRegularIcon } from "../../../shared/icons/globe-regular-icon";
import { BlockCollection } from "../../shared/block-collection/block-collection";
import {
  blockCollectionContentsGetEntityVariables,
  getBlockCollectionContents,
  isBlockCollectionContentsEmpty,
} from "../../shared/block-collection-contents";
import { BlockCollectionContextProvider } from "../../shared/block-collection-context";
import { useCreateBlockCollection } from "../../shared/use-create-block-collection";
import { ProfileSectionHeading } from "../[shortname]/shared/profile-section-heading";

export const ProfileBio: FunctionComponent<{
  profile: User | Org;
  refetchProfile: () => Promise<void>;
  isEditable: boolean;
}> = ({ profile, refetchProfile, isEditable }) => {
  const webId = (
    profile.kind === "user" ? profile.accountId : profile.webId
  ) as WebId;

  const { data, loading, refetch } = useQuery<
    GetEntityQuery,
    GetEntityQueryVariables
  >(getEntityQuery, {
    variables: {
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain -- potential crash otherwise
      entityId: profile.hasBio?.profileBioEntity.metadata.recordId.entityId!,
      ...blockCollectionContentsGetEntityVariables,
    },
    skip: !profile.hasBio,
  });

  const profileBioSubgraph = data
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
        data.getEntity.subgraph,
      )
    : undefined;

  const profileBioEntityId =
    profile.hasBio?.profileBioEntity.metadata.recordId.entityId;

  const [isEditing, setIsEditing] = useState(false);
  const [isTogglingEdit, setIsTogglingEdit] = useState(false);

  const profileBioContents =
    profileBioEntityId && profileBioSubgraph
      ? getBlockCollectionContents({
          blockCollectionSubgraph: profileBioSubgraph,
          blockCollectionEntityId: profileBioEntityId,
        })
      : undefined;

  const { createEntity } = useBlockProtocolCreateEntity(webId);
  const { createBlockCollectionEntity } = useCreateBlockCollection({
    webId,
  });

  const createProfileBioEntity = useCallback(async () => {
    if (profile.hasBio) {
      return;
    }

    const profileBioEntity = await createBlockCollectionEntity({
      kind: "profileBio",
    });

    await createEntity({
      data: {
        entityTypeIds: [systemLinkEntityTypes.hasBio.linkEntityTypeId],
        linkData: {
          leftEntityId: profile.entity.metadata.recordId.entityId,
          rightEntityId: profileBioEntity.metadata.recordId.entityId,
        },
        properties: {},
      },
    });

    await refetchProfile();
  }, [createBlockCollectionEntity, createEntity, refetchProfile, profile]);

  const toggleEdit = useCallback(async () => {
    setIsTogglingEdit(true);
    if (isEditing) {
      await refetch();
      setIsEditing(false);
    } else {
      if (!profile.hasBio) {
        await createProfileBioEntity();
      }
      setIsEditing(true);
    }
    setIsTogglingEdit(false);
  }, [profile, createProfileBioEntity, refetch, isEditing]);

  const isBioEmpty = useMemo(() => {
    if (!profile.hasBio || !profileBioContents) {
      return true;
    }

    return isBlockCollectionContentsEmpty({ contents: profileBioContents });
  }, [profile, profileBioContents]);

  return (
    <>
      <Box display="flex" columnGap={1.5}>
        <ProfileSectionHeading marginBottom={1.5}>
          Overview
        </ProfileSectionHeading>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: ({ palette }) => palette.gray[70],
          }}
        >
          Always{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.common.black }}
          >
            <GlobeRegularIcon sx={{ fontSize: 11, marginBottom: -0.1 }} />{" "}
            Public
          </Box>
        </Typography>
      </Box>
      <Box
        sx={{
          paddingY: 3,
          paddingX: 4,
          backgroundColor: ({ palette }) => palette.common.white,
          display: "flex",
          alignItems: "flex-start",
          borderRadius: "8px",
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderWidth: 1,
          justifyContent: "space-between",
        }}
      >
        {profile.hasBio && profileBioContents && (isEditing || !isBioEmpty) ? (
          <BlockLoadedProvider>
            <UserBlocksProvider value={{}}>
              <Box
                sx={{
                  flexGrow: 1,
                  paddingY: isEditing ? 2 : 0,
                }}
              >
                <BlockCollectionContextProvider
                  blockCollectionSubgraph={profileBioSubgraph}
                  userPermissionsOnEntities={
                    data?.getEntity.userPermissionsOnEntities
                  }
                >
                  <BlockCollection
                    contents={profileBioContents}
                    webId={webId}
                    entityId={
                      profile.hasBio.profileBioEntity.metadata.recordId.entityId
                    }
                    readonly={!isEditable || !isEditing}
                    sx={{
                      ".ProseMirror": {
                        paddingLeft: isEditing ? 1 : 0,
                        transition: ({ transitions }) =>
                          transitions.create("padding"),
                      },
                    }}
                  />
                </BlockCollectionContextProvider>
              </Box>
            </UserBlocksProvider>
          </BlockLoadedProvider>
        ) : isBioEmpty && !loading ? (
          <Typography
            onClick={() => {
              if (isEditable) {
                void toggleEdit();
              }
            }}
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            Add a bio for{" "}
            {profile.kind === "user" ? profile.displayName : profile.name}...
          </Typography>
        ) : (
          <Skeleton width="75%" />
        )}
        {isEditable ? (
          <IconButton
            onClick={toggleEdit}
            disabled={isTogglingEdit}
            sx={{
              color: ({ palette }) => palette.blue[70],
              marginRight: -2,
              marginTop: -1,
            }}
            aria-label={isEditing ? "Save Bio" : "Edit Bio"}
          >
            {isEditing ? <CheckRegularIcon /> : <PenRegularIcon />}
          </IconButton>
        ) : null}
      </Box>
    </>
  );
};
