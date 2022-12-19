import { BlockComponent } from "@blockprotocol/graph/react";
import { setup } from "twind";
import { Media, MediaEntityProperties } from "./components/media";

export type BlockEntityProperties = MediaEntityProperties;

setup({ preflight: false });

export const Video: BlockComponent<BlockEntityProperties> = (props) => (
  <Media {...props} mediaType="video" />
);
