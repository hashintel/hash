import { Effect, Ref } from "effect";

import * as RequestId from "./models/request/RequestId.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/RequestIdProducer",
);
export type TypeId = typeof TypeId;

export interface RequestIdProducer {
  [TypeId]: TypeId;
}

interface RequestIdProducerImpl extends RequestIdProducer {
  value: Ref.Ref<number>;
}

const RequestIdProducerProto: Omit<RequestIdProducer, "value"> = {
  [TypeId]: TypeId,
};

export const make = () =>
  Effect.gen(function* () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const object = Object.create(RequestIdProducerProto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    object.value = yield* Ref.make(0);

    return object as RequestIdProducer;
  });

export const next = (producer: RequestIdProducer) =>
  Effect.gen(function* () {
    const impl = producer as RequestIdProducerImpl;

    return yield* Ref.getAndUpdate(impl.value, (value) =>
      value === RequestId.MAX_VALUE ? RequestId.MIN_VALUE : value + 1,
    );
  });
