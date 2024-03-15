/* eslint-disable global-require */
import React from "react";
import ReactDOM from "react-dom";
import lodash from "lodash";

/**
 * Dependencies to be made available to external blocks must be referenced here
 */
export const blockDependencies: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  lodash,
};
