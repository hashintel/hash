import Script from "next/script";
import { useEffect, useState } from "react";

type GoogleFilePickerProps = {
  accessToken: string;
  onUserChoice: (selectedFile: google.picker.DocumentObject | null) => void;
};

export const GoogleFilePicker = ({
  accessToken,
  onUserChoice,
}: GoogleFilePickerProps) => {
  const [ready, setReady] = useState(typeof gapi !== "undefined");

  useEffect(() => {
    if (accessToken && ready) {
      gapi.load("picker", () => {
        const picker = new google.picker.PickerBuilder()
          .addView(google.picker.ViewId.SPREADSHEETS)
          .setOAuthToken(accessToken)
          .setCallback((response) => {
            if (
              response.action !== google.picker.Action.PICKED ||
              !response.docs[0]
            ) {
              onUserChoice(null);
              return;
            }

            onUserChoice(response.docs[0]);
          })
          .build();
        picker.setVisible(true);
      });
    }
  }, [accessToken, onUserChoice, ready]);

  return (
    <Script
      async
      defer
      src="https://apis.google.com/js/api.js"
      onReady={() => setReady(true)}
    />
  );
};
