import { WebcamIcon } from "lucide-react";

import { Button } from "../button/button";
import * as FileUpload from "./file-upload";

export const App = () => {
  return (
    <FileUpload.Root capture="environment">
      <FileUpload.HiddenInput />
      <FileUpload.Trigger asChild>
        <Button variant="outline" size="sm">
          <WebcamIcon /> Take picture
        </Button>
      </FileUpload.Trigger>
      <FileUpload.List />
    </FileUpload.Root>
  );
};
