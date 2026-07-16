import "./atlas-demo.css";
import { createRoot } from "react-dom/client";

import { AtlasDemo } from "./atlas-demo";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Atlas demo root element is missing");
}

createRoot(rootElement).render(<AtlasDemo />);
