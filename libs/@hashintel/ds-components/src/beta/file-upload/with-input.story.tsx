import { FileUpIcon } from "lucide-react";

import { CloseButton } from "../close-button";
import * as FileUpload from "../file-upload";
import { Input } from "../input";
import { InputGroup } from "../input-group";

export const App = () => {
  return (
    <FileUpload.Root gap="1.5">
      <FileUpload.HiddenInput />
      <FileUpload.Label>Upload file</FileUpload.Label>
      <InputGroup
        startElement={<FileUpIcon />}
        endElement={
          <FileUpload.ClearTrigger asChild>
            <CloseButton size="xs" variant="plain" me="-2" />
          </FileUpload.ClearTrigger>
        }
      >
        <Input asChild>
          <FileUpload.Trigger>
            <FileUpload.FileText lineClamp={1} />
          </FileUpload.Trigger>
        </Input>
      </InputGroup>
    </FileUpload.Root>
  );
};
