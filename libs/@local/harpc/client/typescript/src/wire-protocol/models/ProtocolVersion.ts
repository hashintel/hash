import { Function } from "effect";
import * as Buffer from "../Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/ProtocolVersion",
);
export type TypeId = typeof TypeId;

export interface ProtocolVersion {
  [TypeId]: TypeId;
  readonly value: number;
}

const ProtocolVersionProto: Omit<ProtocolVersion, "value"> = {
  [TypeId]: TypeId,
};

const make = (value: number): ProtocolVersion => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(ProtocolVersionProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.value = value;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const encode: {
  (
    version: ProtocolVersion,
  ): (buffer: Buffer.Buffer<Buffer.Write>) => Buffer.Buffer<Buffer.Write>;
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    version: ProtocolVersion,
  ): Buffer.Buffer<Buffer.Write>;
} = Function.dual(
  2,
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    version: ProtocolVersion,
  ): Buffer.Buffer<Buffer.Write> => {
    return Buffer.putU8(buffer, version.value);
  },
);

export const V1: ProtocolVersion = make(1);
