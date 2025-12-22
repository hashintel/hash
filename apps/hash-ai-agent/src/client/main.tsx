/**
 * Client entry point for the HASH AI Agent chat interface.
 *
 * This is a minimal React SPA that connects to the Mastra server backend.
 * The server runs on port 4111, and Vite proxies /chat/* requests to it.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
