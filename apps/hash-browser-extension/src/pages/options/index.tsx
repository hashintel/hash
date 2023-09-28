// eslint-disable-next-line canonical/filename-no-index
import { createRoot } from "react-dom/client";

import { Options } from "./options";

const container = document.getElementById("app-container");
const root = createRoot(container!);
root.render(<Options />);
