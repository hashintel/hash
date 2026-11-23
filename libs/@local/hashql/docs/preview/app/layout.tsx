import { RootProvider } from "@fumadocs/base-ui/provider/next";

import type { ReactNode } from "react";

import "@fumadocs/base-ui/style.css";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
