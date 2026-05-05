"use client";

import { useFileUploadContext } from "@ark-ui/react/file-upload";
import { ImageUpIcon, XIcon } from "lucide-react";

import { Button } from "../button/button";
import { IconButton } from "../icon-button/icon-button";
import * as FileUpload from "./file-upload";

const FileUploadList = () => {
  const fileUpload = useFileUploadContext();
  const files = fileUpload.acceptedFiles;
  if (files.length === 0) {
    return null;
  }

  return (
    <FileUpload.ItemGroup>
      {files.map((file) => (
        <FileUpload.Item file={file} key={file.name} p="0.5" w="fit-content">
          <FileUpload.ItemPreviewImage />
          <FileUpload.ItemDeleteTrigger asChild>
            <IconButton
              size="2xs"
              borderRadius="full"
              pos="absolute"
              top="-2"
              right="-2"
            >
              <XIcon />
            </IconButton>
          </FileUpload.ItemDeleteTrigger>
        </FileUpload.Item>
      ))}
    </FileUpload.ItemGroup>
  );
};

export const App = () => {
  return (
    <FileUpload.Root accept="image/*">
      <FileUpload.HiddenInput />
      <FileUpload.Trigger asChild>
        <Button variant="outline" size="sm">
          <ImageUpIcon /> Upload image
        </Button>
      </FileUpload.Trigger>
      <FileUploadList />
    </FileUpload.Root>
  );
};
