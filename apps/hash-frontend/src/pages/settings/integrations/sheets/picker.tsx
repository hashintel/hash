import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Container, Typography } from "@mui/material";
import Script from "next/script";
import { useEffect, useState } from "react";

import { Button } from "../../../../shared/ui/button";

export const GooglePicker = () => {
  const onScriptLoad = () => {
    gapi.load("picker", () => console.log("Picker loaded"));
  };

  const showPicker = () => {
    const picker = new gapi.picker.PickerBuilder()
      .addView(google.picker.ViewId.SHEETS)
      .setOAuthToken(accessToken)
      .setDeveloperKey("API_KEY")
      .setCallback(pickerCallback)
      .build();
    picker.setVisible(true);
  };

  return (
    <>
      <Script
        async
        defer
        src="https://apis.google.com/js/api.js"
        onLoad={onScriptLoad}
      />
      <Container>
        <Box>
          <Button onClick={showPicker}>Choose a file</Button>
        </Box>
      </Container>
    </>
  );
};
