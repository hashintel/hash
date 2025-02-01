import {
  type FastCheck,
  type Effect,
  Either,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, implDecode, implEncode } from "../utils.js";

import * as SubsystemId from "./SubsystemId.js";
import * as Version from "./Version.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/SubsystemDescriptor",
);

export type TypeId = typeof TypeId;

export interface SubsystemDescriptor
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly id: SubsystemId.SubsystemId;
  readonly version: Version.Version;
}

const SubsystemDescriptorProto: Omit<SubsystemDescriptor, "id" | "version"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: SubsystemDescriptor, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isSubsystemDescriptor(that) &&
      Equal.equals(this.id, that.id) &&
      Equal.equals(this.version, that.version)
    );
  },

  [Hash.symbol](this: SubsystemDescriptor) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.id)),
      Hash.combine(Hash.hash(this.version)),
      Hash.cached(this),
    );
  },

  toString(this: SubsystemDescriptor) {
    return `SubsystemDescriptor(${this.id.toString()}, ${this.version.toString()})`;
  },

  toJSON(this: SubsystemDescriptor) {
    return {
      _id: "SubsystemDescriptor",
      id: this.id.toJSON(),
      version: this.version.toJSON(),
    };
  },

  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

export const make = (
  id: SubsystemId.SubsystemId,
  version: Version.Version,
): SubsystemDescriptor =>
  createProto(SubsystemDescriptorProto, { id, version });

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, descriptor: SubsystemDescriptor) =>
  pipe(
    buffer,
    SubsystemId.encode(descriptor.id),
    Either.andThen(Version.encode(descriptor.version)),
  ),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    const id = yield* SubsystemId.decode(buffer);
    const version = yield* Version.decode(buffer);

    return make(id, version);
  }),
);

export const isSubsystemDescriptor = (
  value: unknown,
): value is SubsystemDescriptor => Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(SubsystemId.arbitrary(fc), Version.arbitrary(fc))
    .map(Function.tupled(make));
