import Script from "next/script";

type GoogleFilePickerProps = {
  accessToken: string;
  onFilePicked: (file: unknown) => void;
};

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;

export const GoogleFilePicker = ({
  accessToken,
  onFilePicked,
}: GoogleFilePickerProps) => {
  const showPicker = () => {
    if (!apiKey) {
      throw new Error("GOOGLE_PICKER_API_KEY is not set");
    }

    gapi.load("picker", () => {
      const picker = new google.picker.PickerBuilder()
        .addView(google.picker.ViewId.SPREADSHEETS)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback(onFilePicked)
        .build();
      picker.setVisible(true);
    });
  };

  return (
    <Script
      async
      defer
      src="https://apis.google.com/js/api.js"
      onLoad={showPicker}
    />
  );
};
