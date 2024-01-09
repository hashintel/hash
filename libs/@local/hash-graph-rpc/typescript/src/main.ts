import * as S from "@effect/schema/Schema";
import { service } from "./client";
import { ProcedureId, ServiceId, ServiceVersion } from "./transport/common";
import { Multiaddr } from "@multiformats/multiaddr/multiaddr";

const AccountService = service(ServiceId(0x00), ServiceVersion(0x00))
  .procedure("createAccount", ProcedureId(0x00), S.struct({}), S.string)
  .build();

async function main() {
  const service = new AccountService(new Multiaddr("/ip4/0.0.0.0/ws"));
  const result = await service.createAccount({});
  console.log(result);
}

main();
