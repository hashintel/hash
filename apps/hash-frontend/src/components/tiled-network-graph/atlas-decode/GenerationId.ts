import { CborVisitor } from "./CborDecoder";
import * as Result from "./Result";

export class GenerationId {
  #inner: Uint8Array;

  constructor(inner: Uint8Array) {
    if (inner.byteLength !== 32) {
      // TODO: error
    }

    this.#inner = inner;
  }
}

// TODO: proper error
export const Visitor: CborVisitor<GenerationId, Error> = {
  expecting: "GenerationId",
  visitByteString(value) {
    // the value must be 32 bytes
    if (value.byteLength !== 32) {
      // TODO: error
    }

    return Result.ok(new GenerationId(value));
  },
};
