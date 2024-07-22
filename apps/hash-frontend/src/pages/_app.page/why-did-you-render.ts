/// <reference types="@welldone-software/why-did-you-render" />

// eslint-disable-next-line unicorn/import-style
import React from "react";

if (process.env.NODE_ENV === "development") {
  const whyDidYouRender = await import("@welldone-software/why-did-you-render");
  whyDidYouRender.default(React, {
    trackAllPureComponents: true,
  });
}

export {};
