import { IconButton, PenRegularIcon } from "@hashintel/design-system";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { ProfileBioProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  EntityId,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph/.";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";
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

const getProfileBioContents = (params: {
  profileBioSubgraph: Subgraph<EntityRootType>;
  profileBioEntityId: EntityId;
}): BlockCollectionContentItem[] => {
  const { profileBioEntityId, profileBioSubgraph } = params;
  const outgoingContentLinks = getOutgoingLinkAndTargetEntities(
    profileBioSubgraph,
    profileBioEntityId,
  )
    .filter(
      ({ linkEntity: linkEntityRevisions }) =>
        linkEntityRevisions[0] &&
        linkEntityRevisions[0].metadata.entityTypeId ===
          types.linkEntityType.contains.linkEntityTypeId,
    )
    .sort((a, b) => {
      const aLinkEntity = a.linkEntity[0]!;
      const bLinkEntity = b.linkEntity[0]!;

      return (
        (aLinkEntity.linkData?.leftToRightOrder ?? 0) -
          (bLinkEntity.linkData?.leftToRightOrder ?? 0) ||
        aLinkEntity.metadata.recordId.entityId.localeCompare(
          bLinkEntity.metadata.recordId.entityId,
        ) ||
        aLinkEntity.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          bLinkEntity.metadata.temporalVersioning.decisionTime.start.limit,
        )
      );
    });

  return outgoingContentLinks.map<BlockCollectionContentItem>(
    ({
      linkEntity: containsLinkEntityRevisions,
      rightEntity: rightEntityRevisions,
    }) => {
      const rightEntity = rightEntityRevisions[0]!;

      const componentId = rightEntity.properties[
        extractBaseUrl(types.propertyType.componentId.propertyTypeId)
      ] as string;

      const blockChildEntity = getOutgoingLinkAndTargetEntities(
        profileBioSubgraph,
        rightEntity.metadata.recordId.entityId,
      ).find(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0] &&
          linkEntityRevisions[0].metadata.entityTypeId ===
            types.linkEntityType.blockData.linkEntityTypeId,
      )?.rightEntity[0];

      if (!blockChildEntity) {
        throw new Error("Error fetching block data");
      }

      return {
        linkEntity: containsLinkEntityRevisions[0]!,
        rightEntity: {
          ...rightEntity,
          blockChildEntity,
          componentId,
        },
      };
    },
  );
};

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

    const contents = getProfileBioContents({
      profileBioSubgraph,
      profileBioEntityId,
    });

    setProfileBioContents(contents);
  }, [getEntity, profile]);

  useEffect(() => {
    if (profile.hasBio && !profileBioContents) {
      void fetchProfileBioContents();
    }
  }, [profile, profileBioContents, fetchProfileBioContents]);

  const { createEntity } = useBlockProtocolCreateEntity(ownedById);

  const createProfileBioEntity = useCallback(async () => {
    if (profile.hasBio) {
      return;
    }

    const [profileBioEntity, blockEntity, textEntity] = await Promise.all([
      createEntity({
        data: {
          entityTypeId: types.entityType.profileBio.entityTypeId,
          properties: {} satisfies ProfileBioProperties,
        },
      }).then(({ data }) => {
        if (!data) {
          throw new Error("Error creating profile bio entity");
        }

        return data;
      }),
      createEntity({
        data: {
          entityTypeId: types.entityType.block.entityTypeId,
          properties: {
            [extractBaseUrl(types.propertyType.componentId.propertyTypeId)]:
              paragraphBlockComponentId,
          },
        },
      }).then(({ data }) => {
        if (!data) {
          throw new Error("Error creating block entity");
        }

        return data;
      }),
      createEntity({
        data: {
          entityTypeId: types.entityType.text.entityTypeId,
          properties: {
            [extractBaseUrl(types.propertyType.tokens.propertyTypeId)]: [],
          },
        },
      }).then(({ data }) => {
        if (!data) {
          throw new Error("Error creating block entity");
        }

        return data;
      }),
    ]);

    await Promise.all([
      createEntity({
        data: {
          entityTypeId: types.linkEntityType.hasBio.linkEntityTypeId,
          linkData: {
            leftEntityId: profile.entity.metadata.recordId.entityId,
            rightEntityId: profileBioEntity.metadata.recordId.entityId,
          },
          properties: {},
        },
      }),
      createEntity({
        data: {
          entityTypeId: types.linkEntityType.contains.linkEntityTypeId,
          linkData: {
            leftEntityId: profileBioEntity.metadata.recordId.entityId,
            rightEntityId: blockEntity.metadata.recordId.entityId,
            leftToRightOrder: 0,
          },
          properties: {},
        },
      }),
      createEntity({
        data: {
          entityTypeId: types.linkEntityType.blockData.linkEntityTypeId,
          linkData: {
            leftEntityId: blockEntity.metadata.recordId.entityId,
            rightEntityId: textEntity.metadata.recordId.entityId,
          },
          properties: {},
        },
      }),
    ]);

    await refetchProfile();
  }, [createEntity, refetchProfile, profile]);

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
