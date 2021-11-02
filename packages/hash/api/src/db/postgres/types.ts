import {
  DatabasePoolConnectionType,
  DatabaseTransactionConnectionType,
} from "slonik";

export type Connection =
  | DatabasePoolConnectionType
  | DatabaseTransactionConnectionType;
