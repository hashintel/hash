import "katex/dist/katex.min.css";

import TeX from "@matejmazur/react-katex";
import type { FunctionComponent } from "react";

export const Math: FunctionComponent<{ formula: string }> = ({ formula }) => (
  <TeX block>{formula}</TeX>
);
