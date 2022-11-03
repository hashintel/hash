import { StrictMode } from "react";
import { render } from "react-dom";
import { FramedBlock } from "./FramedBlock";

render(
  <StrictMode>
    <FramedBlock />
  </StrictMode>,
  document.getElementById("root"),
);
