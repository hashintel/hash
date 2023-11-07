import { faImage } from "@fortawesome/free-regular-svg-icons";
import {
  Avatar,
  FontAwesomeIcon,
  IconButton,
  RotateIconRegular,
} from "@hashintel/design-system";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { Box, buttonClasses, styled } from "@mui/material";
import Image from "next/image";
import {
  ChangeEventHandler,
  FunctionComponent,
  useCallback,
  useRef,
  useState,
} from "react";

import { useBlockProtocolArchiveEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { User } from "../../../lib/user-and-org";
import { useFileUploads } from "../../../shared/file-upload-context";
import { TrashRegularIcon } from "../../../shared/icons/trash-regular-icon";
import { XMarkRegularIcon } from "../../../shared/icons/x-mark-regular-icon";
import { Button, ButtonProps } from "../../../shared/ui";
import { useUpdateProfileAvatar } from "../../[shortname]/shared/use-update-profile-avatar";
import { useAuthInfo } from "../../shared/auth-info-context";
import { getImageUrlFromEntityProperties } from "../../shared/get-image-url-from-properties";
import { leftColumnWidth } from "../util";

const AvatarButton = styled((props: ButtonProps) => (
  <Button variant="tertiary" {...props} />
))(({ theme }) => ({
  background: "transparent",
  borderWidth: 0,
  padding: 0,
  minHeight: "unset",
  fontSize: 12,
  [`.${buttonClasses.startIcon}`]: {
    marginLeft: 0,
    transition: theme.transitions.create("color"),
    color: "#FFFFFF80",
    padding: theme.spacing(0.75),
    background: "#0E1114CC",
    borderRadius: 4,
  },
  [`&.${buttonClasses.disabled}`]: {
    background: "transparent",
    color: theme.palette.common.white,
    opacity: 0.5,
  },
  color: theme.palette.common.white,
  "&:hover": {
    background: "transparent",
    color: theme.palette.common.white,
    [`.${buttonClasses.startIcon}`]: {
      color: theme.palette.common.white,
      background: "#0E1114CC",
    },
  },
}));

const CloseIconButton = styled(IconButton)(({ theme }) => ({
  background: theme.palette.common.black,
  color: theme.palette.gray[60],
  transition: theme.transitions.create("color"),
  "&:hover": {
    background: theme.palette.common.black,
    color: theme.palette.common.white,
  },
}));

const avatarTopOffset = 25;

export const UserProfileInfoModalHeader: FunctionComponent<{
  userProfile: User;
  onClose: () => void;
  refetchUserProfile: () => Promise<void>;
}> = ({ userProfile, onClose, refetchUserProfile }) => {
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const avatarImageInputRef = useRef<HTMLInputElement>(null);

  const { updateProfileAvatar, newAvatarImageUploading } =
    useUpdateProfileAvatar({ profile: userProfile });

  const [newCoverImageUploading, setNewCoverImageUploading] = useState(false);

  const existingCoverImageEntity = userProfile.hasCoverImage?.imageEntity;

  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { uploadFile } = useFileUploads();
  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const coverImageSrc = userProfile.hasCoverImage
    ? getImageUrlFromEntityProperties(
        userProfile.hasCoverImage.imageEntity.properties,
      )
    : undefined;

  const avatarSrc = userProfile.hasAvatar
    ? getImageUrlFromEntityProperties(
        userProfile.hasAvatar.imageEntity.properties,
      )
    : undefined;

  const handleChangeAvatarImage = useCallback(
    () => avatarImageInputRef.current?.click(),
    [],
  );

  const handleChangeCoverImage = useCallback(
    () => coverImageInputRef.current?.click(),
    [],
  );

  const handleAvatarImageFileUpload = useCallback<
    ChangeEventHandler<HTMLInputElement>
  >(
    async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        throw new Error("No file provided");
      }

      await updateProfileAvatar(file);

      void refetchUserProfile();
    },
    [updateProfileAvatar, refetchUserProfile],
  );

  const handleCoverImageFileUpload = useCallback<
    ChangeEventHandler<HTMLInputElement>
  >(
    async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        throw new Error("No file provided");
      }

      setNewCoverImageUploading(true);

      await uploadFile({
        ownedById: userProfile.accountId as OwnedById,
        makePublic: true,
        fileData: {
          description: `The cover image for the ${userProfile.preferredName} user in HASH`,
          name: `${userProfile.preferredName}'s cover image`,
          file,
          ...(existingCoverImageEntity
            ? {
                fileEntityUpdateInput: {
                  existingFileEntityId: existingCoverImageEntity.metadata
                    .recordId.entityId as EntityId,
                },
              }
            : {
                fileEntityCreationInput: {
                  entityTypeId: systemTypes.entityType.imageFile.entityTypeId,
                },
              }),
        },
        ...(userProfile.hasCoverImage
          ? {}
          : {
              linkedEntityData: {
                linkedEntityId: userProfile.entity.metadata.recordId.entityId,
                linkEntityTypeId:
                  systemTypes.linkEntityType.hasCoverImage.linkEntityTypeId,
              },
            }),
      });

      /** @todo: error handling */

      void refetchUserProfile();
      void refetchUserAndOrgs();

      setNewCoverImageUploading(false);
    },
    [
      existingCoverImageEntity,
      refetchUserAndOrgs,
      uploadFile,
      userProfile,
      refetchUserProfile,
    ],
  );

  const handleRemoveCoverImage = useCallback(async () => {
    if (userProfile.hasCoverImage) {
      await archiveEntity({
        data: {
          entityId:
            userProfile.hasCoverImage.linkEntity.metadata.recordId.entityId,
        },
      });

      /** @todo: consider also archiving image file entity */

      void refetchUserProfile();
      void refetchUserAndOrgs();
    }
  }, [userProfile, archiveEntity, refetchUserProfile, refetchUserAndOrgs]);

  return (
    <Box
      sx={{
        display: "flex",
        padding: 3,
        justifyContent: "space-between",
        columnGap: 5,
        position: "relative",
        background: ({ palette }) => palette.gray[90],
      }}
    >
      {coverImageSrc ? (
        <Image
          src={coverImageSrc}
          alt="user-cover-image"
          layout="fill"
          objectFit="cover"
          objectPosition="center"
        />
      ) : null}
      <Box
        component="input"
        type="file"
        ref={avatarImageInputRef}
        onChange={handleAvatarImageFileUpload}
        sx={{ display: "none" }}
        accept="image/*"
      />
      <Avatar
        src={avatarSrc}
        title={userProfile.preferredName}
        size={leftColumnWidth}
        sx={{
          border: "none",
          flexShrink: 0,
          marginBottom: ({ spacing }) =>
            `calc(-1 * (${avatarTopOffset}px + ${spacing(3)}))`,
        }}
        onEditIconButtonDisabled={newAvatarImageUploading}
        onEditIconButtonClick={handleChangeAvatarImage}
      />
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="flex-start"
      >
        <Box
          component="input"
          type="file"
          ref={coverImageInputRef}
          onChange={handleCoverImageFileUpload}
          sx={{ display: "none" }}
          accept="image/*"
        />
        {userProfile.hasCoverImage ? (
          <>
            <AvatarButton
              disabled={newCoverImageUploading}
              startIcon={<RotateIconRegular />}
              sx={{ marginBottom: 1 }}
              onClick={handleChangeCoverImage}
            >
              Change cover image
            </AvatarButton>
            <AvatarButton
              disabled={newCoverImageUploading}
              startIcon={<TrashRegularIcon />}
              onClick={handleRemoveCoverImage}
            >
              Remove cover image
            </AvatarButton>
          </>
        ) : (
          <AvatarButton
            disabled={newCoverImageUploading}
            startIcon={<FontAwesomeIcon icon={faImage} />}
            onClick={handleChangeCoverImage}
          >
            Add cover image
          </AvatarButton>
        )}
      </Box>
      <Box>
        <CloseIconButton
          onClick={onClose}
          sx={{ marginTop: -2, marginRight: -2 }}
        >
          <XMarkRegularIcon />
        </CloseIconButton>
      </Box>
    </Box>
  );
};
