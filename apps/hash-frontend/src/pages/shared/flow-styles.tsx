import { Avatar } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";

import { Link } from "../../shared/ui/link";
import { defaultCellSx } from "./virtualized-table";

export const flowTableRowHeight = 58;

export const flowTableCellSx = {
  ...defaultCellSx,
  borderRight: "none",
  height: flowTableRowHeight,
  "*": {
    whiteSpace: "nowrap",
    overflowX: "hidden",
    textOverflow: "ellipsis",
  },
};

export const FlowTableWebChip = ({
  avatarUrl,
  name,
  shortname,
}: {
  avatarUrl?: string;
  name: string;
  shortname: string;
}) => (
  <Link href={`/@${shortname}`} noLinkStyle>
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="center"
      gap={0.8}
      sx={({ palette, transitions }) => ({
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 2,
        display: "inline-flex",
        py: "3px",
        px: 1.2,
        "&:hover": {
          border: `1px solid ${palette.common.black}`,
        },
        transition: transitions.create("border"),
      })}
    >
      <Avatar src={avatarUrl} title={name} size={14} />
      <Typography component="span" sx={{ fontSize: 12, fontWeight: 500 }}>
        {name}
      </Typography>
    </Stack>
  </Link>
);
