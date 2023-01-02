import {
  faCircleExclamation,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  BoxProps,
  Collapse,
  styled,
  Tooltip,
  tooltipClasses,
  TooltipProps,
  Typography,
} from "@mui/material";
import { forwardRef, FunctionComponent } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";

const DisabledTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    width: 260,
    backgroundColor: theme.palette.common.white,
    padding: theme.spacing(2),
    color: theme.palette.orange[80],
    boxShadow: theme.boxShadows.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.palette.gray[20],
  },
}));

export type SubmitButtonWrapperProps = {
  useTooltip?: boolean;
  helperText: string;
} & BoxProps;

export const SubmitButtonWrapper: FunctionComponent<SubmitButtonWrapperProps> =
  forwardRef(({ children, useTooltip, helperText, ...props }, ref) => {
    if (useTooltip && helperText) {
      return (
        <DisabledTooltip
          placement="top"
          title={
            <Box display="flex" alignItems="center">
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: ({ palette }) => palette.orange[20],
                  color: ({ palette }) => palette.orange[60],
                  mr: "12px",
                  "& svg": {
                    fontSize: 16,
                  },
                }}
              >
                <FontAwesomeIcon sx={{}} icon={faWarning} />
              </Box>
              <Typography variant="smallTextLabels" fontWeight={500} flex={1}>
                {helperText}
              </Typography>
            </Box>
          }
        >
          <Box ref={ref} {...props}>
            {children}
          </Box>
        </DisabledTooltip>
      );
    }

    return (
      <Box ref={ref} {...props}>
        {children}
        <Collapse in={Boolean(helperText)}>
          <Box display="flex" alignItems="center" mt={1}>
            <FontAwesomeIcon
              sx={({ palette }) => ({
                mr: 1,
                color: palette.orange[50],
              })}
              icon={faCircleExclamation}
            />
            <Typography
              variant="microText"
              sx={{
                color: ({ palette }) => palette.orange[80],
                fontWeight: 500,
              }}
            >
              {helperText}
            </Typography>
          </Box>
        </Collapse>
      </Box>
    );
  });
