/** Local Flue chat surface. Petrinaut's panel is the production UI. */

import { createRoot } from "react-dom/client";

import { Chat } from "./chat.tsx";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing its #root container");

createRoot(container).render(<Chat />);
