import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import * as S from "@effect/schema/Schema";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";

import { service } from "./Client";
import { ProcedureId, ServiceId, ServiceVersion } from "./transport/common";
import { RpcResult } from "./status";

export const AccountService = service(ServiceId(0x00), ServiceVersion(0x00))
  .procedure(
    "createAccount", //
    ProcedureId(0x00),
    S.null,
    RpcResult(S.string),
  )
  .procedure(
    "createAccountGroup",
    ProcedureId(0x01),
    S.null,
    RpcResult(S.string),
  )
  .procedure(
    "checkAccountGroupPermission",
    ProcedureId(0x02),
    // TODO: properly type...
    S.struct({
      accountGroupId: S.string,
      permission: S.string,
    }),
    RpcResult(S.boolean),
  )
  .procedure(
    "addAccountGroupMember",
    ProcedureId(0x03),
    S.struct({
      accountGroupId: S.string,
      accountId: S.string,
    }),
    RpcResult(S.null),
  )
  .procedure(
    "removeAccountGroupMember",
    ProcedureId(0x04),
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
