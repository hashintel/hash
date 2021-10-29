import type { VoidFunctionComponent } from "react";
import { BlockProtocolProps } from "./index";

export type BlockComponent<P = {}> = VoidFunctionComponent<
  P & BlockProtocolProps
>;
