/// <reference types="vite/client" />

declare module "@fontsource-variable/*";

declare module "virtual:archinaut-map" {
  const model: import("./navigator/model/map-data").MapModel;
  export default model;
}
