import React from "react";
import { BlockComponent } from "@blockprotocol/graph";
import { Media, MediaEntityProperties } from "./components/media";

export const Image: BlockComponent<MediaEntityProperties> = (props) => (
  <Media {...props} mediaType="video" />
);
