import { Function, pipe } from "effect";

import * as Buffer from "../Buffer.js";
import * as ProtocolVersion from "./ProtocolVersion.js";

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

export const encode: {
  (
    protocol: Protocol,
  ): (buffer: Buffer.Buffer<Buffer.Write>) => Buffer.Buffer<Buffer.Write>;
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    protocol: Protocol,
  ): Buffer.Buffer<Buffer.Write>;
} = Function.dual(
  2,
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    protocol: Protocol,
  ): Buffer.Buffer<Buffer.Write> => {
    return pipe(
      buffer,
      Buffer.putSlice(new Uint8Array([104, 97, 114, 112, 99])),
      ProtocolVersion.encode(protocol.version),
    );
  },
);
