import type { WebId } from "@blockprotocol/type-system";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useCallback, useState } from "react";

import type { Org, User } from "../../../../lib/user-and-org";
import { useFileUploads } from "../../../../shared/file-upload-context";
import { useAuthInfo } from "../../../shared/auth-info-context";

export const useUpdateProfileAvatar = (props: {
  profile?: User | Org;
  profileName?: string;
}) => {
  const { profile } = props;
  const [newAvatarImageUploading, setNewAvatarImageUploading] = useState(false);

  const existingAvatarImageEntity = profile?.hasAvatar?.imageEntity;

  const webId =
    profile?.kind === "user" ? (profile.accountId as WebId) : profile?.webId;

  const { uploadFile } = useFileUploads();
  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const updateProfileAvatar = useCallback(
    async (file: File) => {
      if (!profile || !webId) {
        return;
      }
      setNewAvatarImageUploading(true);

      const profileName =
        props.profileName ??
        (profile.kind === "user" ? profile.displayName : profile.name);

      await uploadFile({
        webId,
        makePublic: !existingAvatarImageEntity,
        fileData: {
          description: `The avatar for the ${profileName} ${profile.kind} in HASH`,
          name: `${profileName}'s avatar image`,
          file,
          ...(existingAvatarImageEntity
            ? {
                fileEntityUpdateInput: {
                  existingFileEntityId:
                    existingAvatarImageEntity.metadata.recordId.entityId,
                },
              }
            : {
                fileEntityCreationInput: {
                  entityTypeId: systemEntityTypes.imageFile.entityTypeId,
                },
              }),
        },
        ...(profile.hasAvatar
          ? {}
          : {
              linkedEntityData: {
                linkedEntityId: profile.entity.metadata.recordId.entityId,
                linkEntityTypeId:
                  systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
              },
            }),
      });

      /** @todo: error handling */

      void refetchUserAndOrgs();

      setNewAvatarImageUploading(false);
    },
    [
      existingAvatarImageEntity,
      webId,
      refetchUserAndOrgs,
      props.profileName,
      uploadFile,
      profile,
    ],
  );

  return { updateProfileAvatar, newAvatarImageUploading };
};
