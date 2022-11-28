import { faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Typography } from "@mui/material";
import {
  bindPopover,
  bindToggle,
  PopupState,
} from "material-ui-popup-state/hooks";
import { ReactNode } from "react";
import { Modal } from "../../../../components/Modals/Modal";
import { withHandler } from "./util";

export const PropertyTypeModal = ({
  popupState,
  title,
  children,
  onClose,
}: {
  popupState: PopupState;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) => (
  <Modal
    {...bindPopover(popupState)}
    disableEscapeKeyDown
    contentStyle={(theme) => ({
      p: "0px !important",
      border: 1,
      borderColor: theme.palette.gray[20],
    })}
  >
    <>
      <Box
        sx={(theme) => ({
          px: 2.5,
          pr: 1.5,
          pb: 1.5,
          pt: 2,
          borderBottom: 1,
          borderColor: theme.palette.gray[20],
          alignItems: "center",
          display: "flex",
        })}
      >
        <Typography
          variant="regularTextLabels"
          sx={{ fontWeight: 500, display: "flex", alignItems: "center" }}
        >
          {title}
        </Typography>
        {/** @todo need to disable this while form is submitting */}
        <IconButton
          {...withHandler(bindToggle(popupState), onClose)}
          sx={(theme) => ({
            ml: "auto",
            svg: {
              color: theme.palette.gray[50],
              fontSize: 20,
            },
          })}
        >
          <FontAwesomeIcon icon={faClose} />
        </IconButton>
      </Box>
      {children}
    </>
  </Modal>
);
