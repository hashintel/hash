import type { FastCheck } from "effect";
import {
  Effect,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import * as ProcedureDescriptor from "../../../types/ProcedureDescriptor.js";
import * as SubsystemDescriptor from "../../../types/SubsystemDescriptor.js";
import { createProto, encodeDual } from "../../../utils.js";
import * as Buffer from "../../Buffer.js";
import * as Payload from "../Payload.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestBegin",
);
export type TypeId = typeof TypeId;

export interface RequestBegin
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly subsystem: SubsystemDescriptor.SubsystemDescriptor;
  readonly procedure: ProcedureDescriptor.ProcedureDescriptor;

  readonly payload: Payload.Payload;
}

const RequestBeginProto: Omit<
  RequestBegin,
  "subsystem" | "procedure" | "payload"
> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestBegin, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isRequestBegin(that) &&
      Equal.equals(this.subsystem, that.subsystem) &&
      Equal.equals(this.procedure, that.procedure) &&
      Equal.equals(this.payload, that.payload)
    );
  },

  [Hash.symbol](this: RequestBegin) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.subsystem)),
      Hash.combine(Hash.hash(this.procedure)),
      Hash.combine(Hash.hash(this.payload)),
      Hash.cached(this),
    );
  },

  toString(this: RequestBegin) {
    return `RequestBegin(${this.subsystem.toString()}, ${this.procedure.toString()}, ${this.payload.toString()})`;
  },

  toJSON(this: RequestBegin) {
    return {
      _id: "RequestBegin",
      subsytem: this.subsystem.toJSON(),
      procedure: this.procedure.toJSON(),
      payload: this.payload.toJSON(),
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
  subsystem: SubsystemDescriptor.SubsystemDescriptor,
  procedure: ProcedureDescriptor.ProcedureDescriptor,
  payload: Payload.Payload,
): RequestBegin =>
  createProto(RequestBeginProto, { subsystem, procedure, payload });

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, begin: RequestBegin) =>
    pipe(
      buffer,
      SubsystemDescriptor.encode(begin.subsystem),
      Effect.andThen(ProcedureDescriptor.encode(begin.procedure)),
      Effect.andThen(Buffer.advance(13)),
      Effect.andThen(Payload.encode(begin.payload)),
    ),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const subsystem = yield* SubsystemDescriptor.decode(buffer);
    const procedure = yield* ProcedureDescriptor.decode(buffer);
    yield* Buffer.advance(buffer, 13);
    const payload = yield* Payload.decode(buffer);

    return make(subsystem, procedure, payload);
  });

export const isRequestBegin = (value: unknown): value is RequestBegin =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(
      SubsystemDescriptor.arbitrary(fc),
      ProcedureDescriptor.arbitrary(fc),
      Payload.arbitrary(fc),
    )
    .map(Function.tupled(make));
