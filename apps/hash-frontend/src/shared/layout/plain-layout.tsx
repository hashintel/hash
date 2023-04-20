import { TextField } from "@hashintel/design-system";
import { Autocomplete, Box, Modal, useTheme } from "@mui/material";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import Head from "next/head";
import NextNProgress from "nextjs-progressbar";
import React, { FunctionComponent, ReactElement, ReactNode } from "react";
import { useKeys } from "rooks";

import { isProduction } from "../../lib/config";

export const PlainLayout: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const { palette } = useTheme();
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  useKeys(["Meta", "k"], () => {
    popupState.toggle();
  });

  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        {!isProduction ? <meta name="robots" content="noindex" /> : null}
      </Head>
      <NextNProgress
        color={palette.primary.main}
        height={2}
        options={{ showSpinner: false }}
        showOnShallow
      />
      <Modal {...bindPopover(popupState)}>
        <Box
          maxWidth={560}
          width="100vw"
          height="100vh"
          display="flex"
          alignItems="center"
          margin="0 auto"
        >
          <Autocomplete
            options={[]}
            openOnFocus
            sx={{ width: "100%" }}
            renderInput={(props) => (
              <TextField
                onBlur={() => popupState.close()}
                autoFocus
                {...props}
              />
            )}
          />
        </Box>
      </Modal>
      {children}
    </>
  );
};

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
