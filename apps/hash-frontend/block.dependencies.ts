/* eslint-disable global-require */
/**
 * Dependencies to be made available to external blocks must be referenced here
 */
export const blockDependencies: Record<string, any> = {
  react: require("react"),
  "react-dom": require("react-dom"),
  lodash: require("lodash"),
};
