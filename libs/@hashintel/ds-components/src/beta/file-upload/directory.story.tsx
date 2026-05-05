import { FolderUpIcon } from "lucide-react";

import { Button } from "../button/button";
import * as FileUpload from "./file-upload";

export const App = () => {
  return (
    <FileUpload.Root directory>
      <FileUpload.HiddenInput />
      <FileUpload.Trigger asChild>
        <Button variant="outline" size="sm">
          <FolderUpIcon /> Upload directory
        </Button>
      </FileUpload.Trigger>
      <FileUpload.List />
    </FileUpload.Root>
  );
};
