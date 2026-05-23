import { initializeSentry } from "./shared/sentry";

initializeSentry();

import { createRoot } from "react-dom/client";

import { WorkingContents } from "./working/working-contents";

const container = document.getElementById("app-container");
const root = createRoot(container!);
root.render(<WorkingContents />);
