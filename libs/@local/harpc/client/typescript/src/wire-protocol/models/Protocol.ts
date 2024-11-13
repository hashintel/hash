import type * as ProtocolVersion from "./ProtocolVersion.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/Protocol",
);
export type TypeId = typeof TypeId;

export interface Protocol {
  [TypeId]: TypeId;
  version: ProtocolVersion.ProtocolVersion;
}

const ProtocolProto: Omit<Protocol, "version"> = {
  [TypeId]: TypeId,
};

export const make = (version: ProtocolVersion.ProtocolVersion): Protocol => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(ProtocolProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.version = version;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};
