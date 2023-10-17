import { IconButton, PenRegularIcon } from "@hashintel/design-system";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { OwnedById } from "@local/hash-subgraph/.";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Skeleton, Typography } from "@mui/material";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { BlockLoadedProvider } from "../../blocks/on-block-loaded";
import { UserBlocksProvider } from "../../blocks/user-blocks";
import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolGetEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { BlockCollectionContentItem } from "../../graphql/api-types.gen";
import { Org, User } from "../../lib/user-and-org";
import { CheckRegularIcon } from "../../shared/icons/check-regular-icon";
import { GlobeRegularIcon } from "../../shared/icons/globe-regular-icon";
import { ProfileSectionHeading } from "../[shortname]/shared/profile-section-heading";
import { BlockCollection } from "../shared/block-collection/block-collection";
import { getBlockCollectionContents } from "../shared/get-block-collection-contents";
import { useCreateBlockCollection } from "../shared/use-create-block-collection";

export const ProfileBio: FunctionComponent<{
  profile: User | Org;
  refetchProfile: () => Promise<void>;
  isEditable: boolean;
}> = ({ profile, refetchProfile, isEditable }) => {
  const ownedById = (
    profile.kind === "user" ? profile.accountId : profile.accountGroupId
  ) as OwnedById;

  const { getEntity } = useBlockProtocolGetEntity();

  const [isEditing, setIsEditing] = useState(false);
  const [isTogglingEdit, setIsTogglingEdit] = useState(false);

  const [profileBioContents, setProfileBioContents] = useState<
    BlockCollectionContentItem[] | null
  >(null);

  const fetchProfileBioContents = useCallback(async () => {
    if (!profile.hasBio) {
      return;
    }

    const profileBioEntityId =
      profile.hasBio.profileBioEntity.metadata.recordId.entityId;

    const { data: profileBioSubgraph } = await getEntity({
      data: {
        entityId: profileBioEntityId,
        graphResolveDepths: {
          hasLeftEntity: { incoming: 2, outgoing: 2 },
          hasRightEntity: { incoming: 2, outgoing: 2 },
        },
      },
    });

    if (!profileBioSubgraph) {
      throw new Error("Error fetching profile bio subgraph");
    }

    const contents = getBlockCollectionContents({
      blockCollectionSubgraph: profileBioSubgraph,
      blockCollectionEntityId: profileBioEntityId,
    });

    setProfileBioContents(contents);
  }, [getEntity, profile]);

  useEffect(() => {
    if (profile.hasBio && !profileBioContents) {
      void fetchProfileBioContents();
    }
  }, [profile, profileBioContents, fetchProfileBioContents]);

  const { createEntity } = useBlockProtocolCreateEntity(ownedById);
  const { createBlockCollectionEntity } = useCreateBlockCollection({
    ownedById,
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
        entityTypeId: types.linkEntityType.hasBio.linkEntityTypeId,
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
      await fetchProfileBioContents();
      setIsEditing(false);
    } else {
      if (!profile.hasBio) {
        await createProfileBioEntity();
      }
      setIsEditing(true);
    }
    setIsTogglingEdit(false);
  }, [profile, createProfileBioEntity, fetchProfileBioContents, isEditing]);

  const isBioEmpty = useMemo(() => {
    if (!profile.hasBio) {
      return true;
    }

    if (!profileBioContents || profileBioContents.length === 0) {
      return true;
    }

    if (
      profileBioContents.length === 1 &&
      profileBioContents[0]!.rightEntity.blockChildEntity.metadata
        .entityTypeId === types.entityType.text.entityTypeId
    ) {
      const tokens = profileBioContents[0]!.rightEntity.blockChildEntity
        .properties[
        extractBaseUrl(types.propertyType.tokens.propertyTypeId)
      ] as TextToken[];

      return tokens.length === 0;
    }

    return false;
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
                <BlockCollection
                  contents={profileBioContents}
                  ownedById={ownedById}
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
              </Box>
            </UserBlocksProvider>
          </BlockLoadedProvider>
        ) : isBioEmpty ? (
          <Typography sx={{ color: ({ palette }) => palette.gray[60] }}>
            Add a bio for{" "}
            {profile.kind === "user" ? profile.preferredName : profile.name}...
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
          >
            {isEditing ? <CheckRegularIcon /> : <PenRegularIcon />}
          </IconButton>
        ) : null}
      </Box>
    </>
  );
};
