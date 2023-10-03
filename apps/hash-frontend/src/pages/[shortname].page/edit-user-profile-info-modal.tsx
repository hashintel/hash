import { Modal } from "@hashintel/design-system";
import { Box, ModalProps } from "@mui/material";
import { FunctionComponent } from "react";

import { User } from "../../lib/user-and-org";
import { UserProfileInfoForm } from "./edit-user-profile-info-modal/user-profile-info-form";
import { UserProfileInfoModalHeader } from "./edit-user-profile-info-modal/user-profile-info-modal-header";

export const EditUserProfileInfoModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
    userProfile: User;
    refetchUserProfile: () => Promise<void>;
  }
> = ({ userProfile, onClose, refetchUserProfile, ...modalProps }) => {
  return (
    <Modal
      {...modalProps}
      sx={{
        "> div": {
          overflow: "hidden",
          padding: 0,
        },
      }}
      onClose={onClose}
    >
      <Box>
        <UserProfileInfoModalHeader
          userProfile={userProfile}
          onClose={onClose}
          refetchUserProfile={refetchUserProfile}
        />
        <Box sx={{ padding: 3 }}>
          <UserProfileInfoForm
            userProfile={userProfile}
            refetchUserProfile={refetchUserProfile}
            closeModal={onClose}
          />
        </Box>
      </Box>
    </Modal>
  );
};
