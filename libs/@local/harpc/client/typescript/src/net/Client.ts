import { ConnectionManager } from "@libp2p/interface-internal";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Client");
export type TypeId = typeof TypeId;

export interface Client {
  [TypeId]: TypeId;
}

interface ClientImpl extends Client {
  manager: ConnectionManager;
}
