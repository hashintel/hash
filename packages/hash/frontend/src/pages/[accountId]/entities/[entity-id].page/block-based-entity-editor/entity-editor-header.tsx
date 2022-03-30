import { ReactNode, VoidFunctionComponent } from "react";
import { Box, Breadcrumbs, Tooltip, Typography } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "../../../../../components/icons";
import { IconButton } from "../../../../../components/IconButton";
import { Button } from "../../../../../components/Button";

export interface EntityEditorHeaderProps {
  children?: ReactNode;
}

export const EntityEditorHeader: VoidFunctionComponent<
  EntityEditorHeaderProps
> = () => {
  return (
    <Box
      sx={{
        background: ({ palette }) => palette.background.paper,
      }}
    >
      <Box
        sx={{
          display: "flex",
          padding: "8px 20px",
          fontSize: "14px",
        }}
      >
        <Breadcrumbs
          sx={{
            flex: 1,
            fontSize: "small",
          }}
          separator={
            <NavigateNextIcon
              fontSize="small"
              sx={(theme) => ({ color: theme.palette.gray[50] })}
            />
          }
          aria-label="breadcrumb"
        >
          <Button size="xs" variant="tertiary_quiet" sx={{ padding: 0 }}>
            hello
          </Button>
          <span>world</span>
        </Breadcrumbs>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Button variant="tertiary_quiet" size="xs">
            share
          </Button>
          <Tooltip title="Copy link, duplicate, delete, and more.">
            <IconButton size="small">
              <FontAwesomeIcon icon={faEllipsisV} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Typography variant="title">Block-based entity editor (WIP)</Typography>
    </Box>
  );
};
