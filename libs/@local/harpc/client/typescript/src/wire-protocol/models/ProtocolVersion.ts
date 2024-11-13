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

export const V1: ProtocolVersion = make(1);
