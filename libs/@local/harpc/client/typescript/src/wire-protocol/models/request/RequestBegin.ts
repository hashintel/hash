import type { Equal, Inspectable, Pipeable } from "effect";

import type * as ProcedureDescriptor from "../../../types/ProcedureDescriptor.js";
import type * as SubsystemDescriptor from "../../../types/SubsystemDescriptor.js";
import type * as Payload from "../Payload.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestBegin",
);
export type TypeId = typeof TypeId;

export interface RequestBegin
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly subsytem: SubsystemDescriptor.SubsystemDescriptor;
  readonly procedure: ProcedureDescriptor.ProcedureDescriptor;

  readonly payload: Payload.Payload;
}
