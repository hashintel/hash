import type { ModalProps } from "@hashintel/design-system";
import {
  MagnifyingGlassRegularIcon,
  Modal,
  PersonRunningRegularIcon,
} from "@hashintel/design-system";
import {
  backdropClasses,
  Box,
  ButtonBase,
  styled,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";

const ModalButton = styled(ButtonBase)(({ theme }) => ({
  flexGrow: 1,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  textAlign: "start",
  borderColor: theme.palette.gray[20],
  borderStyle: "solid",
  borderWidth: 1,
  padding: theme.spacing(2.5),
  transition: theme.transitions.create("background"),
  "&:hover": {
    background: theme.palette.gray[15],
    ".heading, svg": {
      color: theme.palette.blue[70],
    },
  },
  ":first-of-type": {
    borderTopLeftRadius: "8px",
    borderBottomLeftRadius: "8px",
  },
  ":last-of-type": {
    borderTopRightRadius: "8px",
    borderBottomRightRadius: "8px",
  },
  svg: {
    color: theme.palette.gray[90],
    fontSize: 21,
    marginBottom: theme.spacing(1),
    transition: theme.transitions.create("color"),
  },
}));

const ButtonHeadingTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 0,
  textTransform: "uppercase",
  transition: theme.transitions.create("color"),
}));

const ButtonSubheadingTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 14,
  fontWeight: 400,
  marginBottom: 0,
}));

export const WelcomeModal: FunctionComponent<
  Omit<ModalProps, "children"> & {
    onLoadExistingEntitiesClick: () => void;
    onJustStartTypingClick: () => void;
  }
> = ({ onJustStartTypingClick, onLoadExistingEntitiesClick, ...props }) => {
  return (
    <Modal
      {...props}
      sx={{
        position: "absolute",
        width: "100%",
        height: "100%",
        "&:focus-visible": {
          outline: 0,
        },
        [`.${backdropClasses.root}`]: {
          position: "absolute",
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(255, 255, 255, 0.5)",
        },
      }}
      contentStyle={{
        p: { xs: 0, md: 0 },
        width: {
          xs: "unset",
          sm: "unset",
        },
      }}
    >
      <Box display="flex">
        <ModalButton
          onClick={onLoadExistingEntitiesClick}
          sx={{
            background: "#FAFBFC",
            width: 335,
          }}
        >
          <MagnifyingGlassRegularIcon />
          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              rowGap: 1,
            }}
          >
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <ButtonHeadingTypography className="heading">
                Load Existing Entities
              </ButtonHeadingTypography>
              <Typography
                sx={{
                  color: ({ palette }) => palette.blue[70],
                  fontSize: 12,
                  textTransform: "uppercase",
                  marginBottom: 0,
                  fontWeight: 600,
                  padding: ({ spacing }) => spacing(0.5, 1.25),
                  background: ({ palette }) => palette.blue[20],
                  borderRadius: "4px",
                }}
              >
                Recommended
              </Typography>
            </Box>
            <ButtonSubheadingTypography>
              Run a query that populates this table with data that matches your
              search
            </ButtonSubheadingTypography>
          </Box>
        </ModalButton>
        <ModalButton
          onClick={onJustStartTypingClick}
          sx={{ background: ({ palette }) => palette.gray[10], width: 270 }}
        >
          <PersonRunningRegularIcon />
          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              rowGap: 1,
            }}
          >
            <ButtonHeadingTypography className="heading">
              Or just start typing
            </ButtonHeadingTypography>
            <ButtonSubheadingTypography>
              Type away to capture information quickly, add structure later
            </ButtonSubheadingTypography>
          </Box>
        </ModalButton>
      </Box>
    </Modal>
  );
};
