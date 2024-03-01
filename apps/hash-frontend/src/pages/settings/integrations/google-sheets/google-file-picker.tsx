import Script from "next/script";
import { useEffect, useState } from "react";

type GoogleFilePickerProps = {
  accessToken: string;
  onUserChoice: (response: google.picker.ResponseObject) => void;
};

export const GoogleFilePicker = ({
  accessToken,
  onUserChoice,
}: GoogleFilePickerProps) => {
  const [ready, setReady] = useState(typeof gapi !== "undefined");

  console.log({ ready, accessToken });

  useEffect(() => {
    if (accessToken && ready) {
      gapi.load("picker", () => {
        const picker = new google.picker.PickerBuilder()
          .addView(google.picker.ViewId.SPREADSHEETS)
          .setOAuthToken(accessToken)
          .setCallback(onUserChoice)
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
      onLoad={() => setReady(true)}
    />
  );
};
