// eslint-disable-next-line canonical/filename-no-index
import { createRoot } from "react-dom/client";

import { Popup } from "./popup";

const container = document.getElementById("app-container");
const root = createRoot(container!);
root.render(<Popup />);
