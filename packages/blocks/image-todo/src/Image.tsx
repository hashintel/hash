import { BlockComponent } from "blockprotocol/react";
import React from "react";
import { Media } from "./components/Media";

type AppProps = {
  initialCaption?: string;
  initialWidth?: number;
  url?: string;
};

export const Image: BlockComponent<AppProps> = (props) => (
  <Media {...props} mediaType="image" />
);
