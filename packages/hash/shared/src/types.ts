import { PageFieldsFragment } from "./graphql/apiTypes.gen";

export type BlockEntity = PageFieldsFragment["properties"]["contents"][number];
