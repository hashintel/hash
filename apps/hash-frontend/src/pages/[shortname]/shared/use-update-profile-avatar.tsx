import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { useCallback, useState } from "react";

import { Org, User } from "../../../lib/user-and-org";
import { useFileUploads } from "../../../shared/file-upload-context";
import { useAuthInfo } from "../../shared/auth-info-context";

export const useUpdateProfileAvatar = (props: {
  profile?: User | Org;
  profileName?: string;
}) => {
  const { profile } = props;
  const [newAvatarImageUploading, setNewAvatarImageUploading] = useState(false);

  const existingAvatarImageEntity = profile?.hasAvatar?.imageEntity;

  const ownedById = (
    profile?.kind === "user" ? profile.accountId : profile?.accountGroupId
  ) as OwnedById | undefined;

  const { uploadFile } = useFileUploads();
  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const updateProfileAvatar = useCallback(
    async (file: File) => {
      if (!profile || !ownedById) {
        return;
      }
      setNewAvatarImageUploading(true);

      const profileName =
        props.profileName ??
        (profile.kind === "user" ? profile.preferredName : profile.name);

      await uploadFile({
        ownedById,
        makePublic: !existingAvatarImageEntity,
        fileData: {
          description: `The avatar for the ${profileName} ${profile.kind} in HASH`,
          name: `${profileName}'s avatar image`,
          file,
          ...(existingAvatarImageEntity
            ? {
                fileEntityUpdateInput: {
                  existingFileEntityId: existingAvatarImageEntity.metadata
                    .recordId.entityId as EntityId,
                },
              }
            : {
                fileEntityCreationInput: {
                  entityTypeId: types.entityType.imageFile.entityTypeId,
                },
              }),
        },
        ...(profile.hasAvatar
          ? {}
          : {
              linkedEntityData: {
                linkedEntityId: profile.entity.metadata.recordId.entityId,
                linkEntityTypeId:
                  types.linkEntityType.hasAvatar.linkEntityTypeId,
              },
            }),
      });

      /** @todo: error handling */

      void refetchUserAndOrgs();

      setNewAvatarImageUploading(false);
    },
    [
      existingAvatarImageEntity,
      ownedById,
      refetchUserAndOrgs,
      props.profileName,
      uploadFile,
      profile,
    ],
  );

  return { updateProfileAvatar, newAvatarImageUploading };
};
