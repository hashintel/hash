import { FileUpIcon } from "lucide-react";

import { Button } from "../button/button";
import * as FileUpload from "./file-upload";

export const App = () => {
  return (
    <FileUpload.Root maxFiles={3}>
      <FileUpload.HiddenInput />
      <FileUpload.Trigger asChild>
        <Button variant="outline" size="sm">
          <FileUpIcon /> Upload file
        </Button>
      </FileUpload.Trigger>
      <FileUpload.List clearable showSize />
    </FileUpload.Root>
  );
};
