import { PageFieldsFragment } from "./graphql/apiTypes.gen";

// @todo use this in more places
export type BlockEntity = PageFieldsFragment["properties"]["contents"][number];
