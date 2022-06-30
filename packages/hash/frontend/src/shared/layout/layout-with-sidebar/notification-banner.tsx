import { VoidFunctionComponent } from "react";
import { Box } from "@mui/material";
import { Button } from "../../ui/button";
import { useArchivePage } from "../../../components/hooks/useArchivePage";
import { useRouteAccountInfo, useRoutePageInfo } from "../../routing";

export const PageNotificationBanner: VoidFunctionComponent = () => {
  const accountId = useRouteAccountInfo({ allowUndefined: true })?.accountId;
  const pageEntityId = useRoutePageInfo({ allowUndefined: true })?.pageEntityId;

  const { unarchivePage } = useArchivePage(accountId, pageEntityId);

  return (
    <Box
      sx={({ palette }) => ({
        color: palette.common.white,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: 1,
        background: "#EB5757",
        padding: 1,
      })}
    >
      This page is archived.
      <Button
        variant="secondary"
        sx={({ palette }) => ({
          marginLeft: 1.5,
          minWidth: 0,
          minHeight: 0,
          paddingY: 0,
          paddingX: 1.5,
          background: "transparent",
          color: palette.common.white,
          borderColor: palette.common.white,
          fontWeight: 400,
          "&:hover": {
            background: "rgba(55, 53, 47, 0.08)",
          },
        })}
        onClick={() => unarchivePage?.()}
      >
        Restore
      </Button>
    </Box>
  );
};
