/* eslint-disable import/first */
import { initializeSentry } from "./shared/sentry";

initializeSentry();

// eslint-disable-next-line import/order
import { createRoot } from "react-dom/client";

import { WorkingContents } from "./working/working-contents";

const container = document.getElementById("app-container");
const root = createRoot(container!);
root.render(<WorkingContents />);
