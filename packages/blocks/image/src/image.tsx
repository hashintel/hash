import React from "react";
import { BlockComponent } from "@blockprotocol/graph";
import { Media, MediaEntityProperties } from "./components/media";

export type BlockEntityProperties = MediaEntityProperties;

export const Image: BlockComponent<BlockEntityProperties> = (props) => (
  <Media {...props} mediaType="image" />
);
