import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@local/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";

import { Modal } from "../../../../../../components/modals/modal";

interface EntityTypeUpdateModalProps {
  open: boolean;
  onClose: () => void;
  entityTypeTitle: string;
  currentVersion: number;
  newVersion: number;
  onUpdateVersion: () => Promise<void>;
  updatingVersion: boolean;
}

export const EntityTypeUpdateModal = ({
  open,
  onClose,
  currentVersion,
  entityTypeTitle,
  newVersion,
  onUpdateVersion,
  updatingVersion,
}: EntityTypeUpdateModalProps) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      contentStyle={{ p: "0px !important", border: 1, borderColor: "gray.20" }}
    >
      <>
        <Box
          sx={{
            height: 56,
            padding: 2.5,
            borderBottom: "1px solid",
            borderBottomColor: "gray.20",
          }}
        >
          <Typography
            sx={{
              display: "flex",
              gap: 0.5,
              alignItems: "center",
              color: "gray.80",
              fontWeight: 500,
            }}
          >
            <>
              Update
              <Box component="span" fontWeight={600}>
                {entityTypeTitle}
              </Box>
              entity type
              <Box component="span" fontWeight={600} color="gray.90">
                v{currentVersion}
              </Box>
              <FontAwesomeIcon icon={faArrowRight} sx={{ color: "gray.50" }} />
              <Box component="span" fontWeight={600} color="gray.90">
                v{newVersion}
              </Box>
            </>
          </Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Typography variant="smallTextParagraphs" color="gray.80">
            Updating the type an entity is assigned to may cause property values
            to be removed, if properties have been removed from the type or if
            their expected values have changed to be incompatible with existing
            data.
          </Typography>

          <Stack direction="row" gap={1.25} mt={2}>
            <Button
              size="small"
              onClick={onUpdateVersion}
              loading={updatingVersion}
              loadingWithoutText
            >
              Update entity type
            </Button>
            <Button variant="tertiary" size="small" onClick={onClose}>
              Cancel
            </Button>
          </Stack>
        </Box>
      </>
    </Modal>
  );
};
