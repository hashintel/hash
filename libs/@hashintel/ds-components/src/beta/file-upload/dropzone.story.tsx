import { Box } from "@hashintel/ds-helpers/jsx";
import { UploadIcon } from "lucide-react";

import * as FileUpload from "../file-upload";
import { Icon } from "../icon";

export const App = () => {
  return (
    <FileUpload.Root>
      <FileUpload.HiddenInput />
      <FileUpload.Dropzone>
        <Icon color="fg.muted" size="lg" mb="4">
          <UploadIcon />
        </Icon>
        <Box>Drag and drop files here</Box>
        <Box color="fg.muted">.png, .jpg up to 5MB</Box>
      </FileUpload.Dropzone>
      <FileUpload.List />
    </FileUpload.Root>
  );
};
