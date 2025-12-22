/**
 * Main App component with React Router setup.
 *
 * Architecture:
 * - This is a client-only React SPA
 * - It connects to the Mastra server (port 4111) via HTTP
 * - Vite's dev server proxies /chat/* to avoid CORS issues
 * - For production, configure your server to handle routing
 */
import { BrowserRouter, Link, Route, Routes } from "react-router";

import { Chat } from "./components/chat";

export const App = () => {
  return (
    <BrowserRouter>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        {/* Simple navigation header */}
        <header
          style={{
            padding: "1rem",
            borderBottom: "1px solid #333",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            HASH AI Agent
          </h1>
          <nav style={{ display: "flex", gap: "1rem" }}>
            <Link to="/" style={{ color: "#888", textDecoration: "none" }}>
              Chat
            </Link>
          </nav>
        </header>

        {/* Main content area */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Routes>
            <Route path="/" element={<Chat />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
