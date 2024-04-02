import lodash from "lodash";
// eslint-disable-next-line unicorn/import-style
import React from "react";
// eslint-disable-next-line unicorn/import-style
import ReactDOM from "react-dom";

/**
 * Dependencies to be made available to external blocks must be referenced here
 */
export const blockDependencies: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  lodash,
};
