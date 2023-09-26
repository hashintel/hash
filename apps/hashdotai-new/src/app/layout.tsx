import "./globals.css";

import type { Metadata } from "next";

import { ThemeRegistry } from "./theme-registry";

export const metadata: Metadata = {
  title: {
    default: "HASH - a workspace for structured knowledge.",
    template: "%s | HASH",
  },
  description:
    "Integrate live data, construct ontologies, and create shared understanding in a collaborative, open-source workspace.",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry options={{ key: "mui" }}>{children}</ThemeRegistry>
      </body>
    </html>
  );
};

export default RootLayout;
