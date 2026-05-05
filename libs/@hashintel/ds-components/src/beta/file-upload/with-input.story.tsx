import { FileUpIcon } from "lucide-react";

import { CloseButton } from "../close-button/close-button";
import { Input } from "../input/input";
import { InputGroup } from "../input-group/input-group";
import * as FileUpload from "./file-upload";

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
