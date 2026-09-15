import { Brand } from "@blockprotocol/type-system";

import { U32 } from "./Decoder";

export type NodeId = Brand<U32, "NodeId">;

export class NodeIdColumn<T extends ArrayBufferLike> {
  #buffer: DataView<T>;

  constructor(buffer: DataView<T>) {
    if (buffer.byteLength % 4 !== 0) {
      // TODO: error
    }

    this.#buffer = buffer;
  }

  get length(): number {
    return this.#buffer.byteLength / 4;
  }

  // TODO: at needs a result?
  at(index: number): NodeId {
    return this.#buffer.getUint32(index * 4, true) as NodeId;
  }

  [Symbol.iterator](): Iterator<NodeId> {
    let index = 0;

    return {
      next: () => {
        if (index >= this.length) {
          return { done: true };
        }

        return { value: this.at(index++), done: false };
      },
    };
  }
}
