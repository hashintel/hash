import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";
import { bindDialog, PopupState } from "material-ui-popup-state/hooks";
import { Modal } from "../../../../components/Modals/Modal";

export interface DeleteDataTypeModalProps {
  popupState: PopupState;
  onClose?: () => void;
  onDelete?: () => void;
  dataTypeCount?: number;
  arrayCount?: number;
  propertyObjectCount?: number;
}

export const DeleteDataTypeModal = ({
  popupState,
  onClose,
  onDelete,
  dataTypeCount = 0,
  arrayCount = 0,
  propertyObjectCount = 0,
}: DeleteDataTypeModalProps) => {
  return (
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
            Remove array and its contents
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
              This array contains
              {dataTypeCount ? (
                <b>{` ${dataTypeCount} data type${
                  dataTypeCount > 1 ? "s" : ""
                }`}</b>
              ) : null}
              {dataTypeCount && (arrayCount || propertyObjectCount)
                ? " and"
                : ""}
              {arrayCount ? (
                <b>{` ${arrayCount} array${arrayCount > 1 ? "s" : ""}`}</b>
              ) : null}
              {arrayCount && propertyObjectCount ? " and" : ""}
              {propertyObjectCount ? (
                <b>{` ${propertyObjectCount} property object${
                  propertyObjectCount > 1 ? "s" : ""
                }`}</b>
              ) : null}
              .
              {dataTypeCount + propertyObjectCount + arrayCount > 1
                ? " These "
                : " This "}
              will be removed from your expected value definition if you
              continue and will need to be individually re-added manually.
              Proceed with caution.
            </Typography>
          </Box>

          <Stack direction="row" gap={1.25}>
            <Button variant="danger" size="small" onClick={onDelete}>
              Confirm deletion
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
