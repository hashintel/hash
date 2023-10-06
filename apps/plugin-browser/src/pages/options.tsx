import { createRoot } from "react-dom/client";

import { OptionsContents } from "./options/options-contents";

const container = document.getElementById("app-container");
const root = createRoot(container!);
root.render(<OptionsContents />);
