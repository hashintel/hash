import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { useCallback, useState } from "react";

import { useBlockProtocolArchiveEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolFileUpload } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
import { Org, User } from "../../../lib/user-and-org";
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

  const { createEntity } = useBlockProtocolCreateEntity(ownedById ?? null);
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { uploadFile } = useBlockProtocolFileUpload(ownedById);
  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const updateProfileAvatar = useCallback(
    async (file: File) => {
      if (!profile) {
        return;
      }
      setNewAvatarImageUploading(true);

      const profileName =
        props.profileName ??
        (profile.kind === "user" ? profile.preferredName : profile.name);

      // Upload the file and get a file entity which describes it
      const { data: fileUploadData, errors: fileUploadErrors } =
        await uploadFile({
          data: {
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
        });

      if (fileUploadErrors || !fileUploadData) {
        throw new Error(
          fileUploadErrors?.[0]?.message ?? "Unknown error uploading file",
        );
      }

      if (profile.hasAvatar) {
        // Delete the existing hasAvatar link, if any
        await archiveEntity({
          data: {
            entityId: profile.hasAvatar.linkEntity.metadata.recordId.entityId,
          },
        });
      }

      // Create a new hasAvatar link from the org to the new file entity
      await createEntity({
        data: {
          entityTypeId: types.linkEntityType.hasAvatar.linkEntityTypeId,
          linkData: {
            leftEntityId: profile.entity.metadata.recordId.entityId,
            rightEntityId: fileUploadData.metadata.recordId
              .entityId as EntityId,
          },
          properties: {},
        },
      });

      /** @todo: error handling */

      void refetchUserAndOrgs();

      setNewAvatarImageUploading(false);
    },
    [
      archiveEntity,
      createEntity,
      existingAvatarImageEntity,
      refetchUserAndOrgs,
      props.profileName,
      uploadFile,
      profile,
    ],
  );

  return { updateProfileAvatar, newAvatarImageUploading };
};
