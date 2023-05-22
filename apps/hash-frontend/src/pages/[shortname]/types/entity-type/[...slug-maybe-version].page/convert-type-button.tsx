import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
  Modal,
} from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { bindDialog, usePopupState } from "material-ui-popup-state/hooks";

interface ConvertTypeButtonProps {
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const ConvertTypeButton = ({
  onSubmit,
  loading,
  disabled,
}: ConvertTypeButtonProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: `convert-type-modal`,
  });

  const onOpen = () => {
    popupState.open();
  };

  const onClose = () => {
    popupState.close();
  };

  return (
    <>
      <Tooltip title="Please publish or discard the current changes before converting to a Link Type.">
        <Box>
          <Button
            variant="tertiary"
            onClick={onOpen}
            loading={loading}
            disabled={disabled}
          >
            Convert to Link Type
          </Button>
        </Box>
      </Tooltip>

      <Modal
        {...bindDialog(popupState)}
        contentStyle={(theme) => ({
          p: "0px !important",
          border: 1,
          borderColor: theme.palette.gray[20],
        })}
      >
        <>
          <Box
            sx={{
              height: 56,
              padding: 2.5,
              borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
            }}
          >
            <Typography
              variant="largeTextLabels"
              sx={{
                fontSize: 16,
                color: ({ palette }) => palette.gray[80],
                fontWeight: 500,
              }}
            >
              Are you sure you want to continue?
            </Typography>

            <IconButton
              sx={{ position: "absolute", top: 16, right: 16 }}
              onClick={onClose}
            >
              <FontAwesomeIcon icon={faClose} />
            </IconButton>
          </Box>
          <Box sx={{ padding: 3 }}>
            <Box sx={{ marginBottom: 2, fontSize: 14, lineHeight: "18px" }}>
              <Typography
                variant="smallTextLabels"
                sx={{ color: ({ palette }) => palette.gray[80] }}
              >
                A new version of this type will be created as a Link Type, and
                you won't be able to revert this change.
              </Typography>
            </Box>

            <Stack direction="row" gap={1.25}>
              <Button
                size="small"
                onClick={() => {
                  onSubmit();
                  onClose();
                }}
              >
                Convert
              </Button>
              <Button variant="tertiary" size="small" onClick={onClose}>
                Cancel
              </Button>
            </Stack>
          </Box>
        </>
      </Modal>
    </>
  );
};
