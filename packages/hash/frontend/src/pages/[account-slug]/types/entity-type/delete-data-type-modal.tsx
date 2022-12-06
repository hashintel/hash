import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";
import { bindDialog, PopupState } from "material-ui-popup-state/hooks";
import { ReactNode } from "react";
import { Modal } from "../../../../components/Modals/Modal";

export interface DeleteDataTypeModalProps {
  popupState: PopupState;
  onClose: () => void;
  onDelete?: () => void;
  dataTypeCount: number;
  arrayCount: number;
  propertyObjectCount: number;
}

export const DeleteDataTypeModal = ({
  popupState,
  onClose,
  onDelete,
  dataTypeCount,
  arrayCount,
  propertyObjectCount,
}: DeleteDataTypeModalProps) => {
  const countArray = [
    { label: "data type", count: dataTypeCount },
    { label: "array", count: arrayCount },
    { label: "property object", count: propertyObjectCount },
  ].filter(({ count }) => count);

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
              {countArray.reduce(
                (nodeArray: ReactNode[], { label, count }, index) => {
                  return [
                    ...nodeArray,
                    <b key="dataType">{` ${count} ${label}${
                      count > 1 ? "s" : ""
                    }`}</b>,
                    ...[
                      countArray.length >= index + 3
                        ? ","
                        : countArray.length >= index + 2
                        ? " and"
                        : "",
                    ],
                  ];
                },
                [],
              )}
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
