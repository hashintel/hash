import { TableLocalColumnPropertyValue, RootEntity } from "./types.gen";

type RootKey = keyof RootEntity["properties"];
type ColumnKey = Readonly<keyof TableLocalColumnPropertyValue>;

export const titleKey =
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/" as const satisfies RootKey;
export const localColumnsKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-column/" as const satisfies RootKey;
export const localRowsKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-row/" as const satisfies RootKey;
export const isStripedKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/is-striped/" as const satisfies RootKey;
export const hideHeaderRowKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-header-row/" as const satisfies RootKey;
export const hideRowNumbersKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-row-numbers/" as const satisfies RootKey;

export const columnTitleKey =
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/" as const satisfies ColumnKey;
export const columnIdKey =
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/" as const satisfies ColumnKey;
