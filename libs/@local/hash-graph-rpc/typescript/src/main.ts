import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import * as S from "@effect/schema/Schema";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";

import * as Client from "./Client";
import * as Procedure from "./Procedure";
import * as Service from "./Service";
import { RpcResult } from "./status";

export const AccountService = Service.create(
  Service.Id(0x00),
  Service.Version(0x00),
)
  .procedure(
    "createAccount", //
    Procedure.Id(0x00),
    S.null,
    RpcResult(S.string),
  )
  .procedure(
    "createAccountGroup",
    Procedure.Id(0x01),
    S.null,
    RpcResult(S.string),
  )
  .procedure(
    "checkAccountGroupPermission",
    Procedure.Id(0x02),
    // TODO: properly type...
    S.struct({
      accountGroupId: S.string,
      permission: S.string,
    }),
    RpcResult(S.boolean),
  )
  .procedure(
    "addAccountGroupMember",
    Procedure.Id(0x03),
    S.struct({
      accountGroupId: S.string,
      accountId: S.string,
    }),
    RpcResult(S.null),
  )
  .procedure(
    "removeAccountGroupMember",
    Procedure.Id(0x04),
    S.struct({
      accountGroupId: S.string,
      accountId: S.string,
    }),
    RpcResult(S.null),
  )
  .build();

export function createTransport() {
  return createLibp2p({
    transports: [webSockets()],
    streamMuxers: [yamux()],
    connectionEncryption: [noise()],
    services: { identify: identify() },
  });
}

export { multiaddr };
export { Client, Procedure, Service };
