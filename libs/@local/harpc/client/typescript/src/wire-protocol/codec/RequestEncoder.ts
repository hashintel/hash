import { Inspectable, Mailbox, Pipeable, Ref } from "effect";
import { Request } from "../models/request/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/codec/RequestEncoder",
);

interface Cursor {
  buffer: ArrayBuffer;
  index: number;
}

export interface RequestEncoder
  extends Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: typeof TypeId;
}

interface RequestEncoderImpl extends RequestEncoder {
  readonly buffer: Ref.Ref<Cursor>;
  readonly output: Mailbox.Mailbox<Request.Request>;
}
