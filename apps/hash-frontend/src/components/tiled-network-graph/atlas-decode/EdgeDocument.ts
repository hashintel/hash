import { BinaryEntityIdColumn } from "./BinaryEntityId";
import { CborDecoder } from "./CborDecoder";
import { Decoder, U64 } from "./Decoder";
import * as Envelope from "./Envelope";
import * as GenerationId from "./GenerationId";
import { NodeIdColumn } from "./NodeId";
import * as Result from "./Result";

interface Header {
  readonly generation: GenerationId.GenerationId;
  readonly variant: U64;
  readonly count: U64;
  readonly complete: boolean;
  readonly hasTrailer: boolean;
}

export interface EdgeDocument<T extends ArrayBufferLike> {
  readonly header: Header;
  readonly sources: NodeIdColumn<T>;
  readonly targets: NodeIdColumn<T>;
  readonly identities: BinaryEntityIdColumn<T>;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

const decodeHead = <T extends ArrayBufferLike>(bytes: Uint8Array<T>) => {
  const decoder = new CborDecoder(bytes);

  return decoder.decode({
    expecting: "head",
    visitMap: (access) =>
      Result.gen(function* () {
        const partial: Partial<Mutable<Header>> = {};

        while (access.remaining > 0) {
          const key = yield* access.readKey();

          if (key === 0n) {
            partial.generation = yield* access.readValue(GenerationId.Visitor);
          } else if (key === 1n) {
            partial.variant = yield* access.readValue({
              expecting: "variant",
              visitUnsignedInteger: (value) => Result.ok(value),
            });
          } else if (key === 2n) {
            partial.count = yield* access.readValue({
              expecting: "count",
              visitUnsignedInteger: (value) => Result.ok(value),
            });
          } else if (key === 3n) {
            partial.complete = yield* access.readValue({
              expecting: "complete",
              visitBoolean: (value) => Result.ok(value),
            });
          } else if (key === 4n) {
            partial.hasTrailer = yield* access.readValue({
              expecting: "hasTrailer",
              visitBoolean: (value) => Result.ok(value),
            });
          } else {
            // TODO: error
          }
        }

        // TODO: validate that not partial
        return partial as Header;
      }),
  });
};

const decodeNodeIdColumn = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  length: number,
) => {
  const buffer = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const column = new NodeIdColumn(buffer);
  if (column.length !== length) {
    // TODO: error
  }

  return Result.ok(column);
};

const decodeIdentities = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  length: number,
) => {
  const buffer = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const column = new BinaryEntityIdColumn(buffer);
  if (column.length !== length) {
    // TODO: error
  }

  return Result.ok(column);
};

export const decode = <T extends ArrayBufferLike>(decoder: Decoder<T>) =>
  Result.gen(function* () {
    const [_, chunks] = yield* Envelope.decode(decoder);
    if (chunks.length !== 4) {
      // TODO: error
    }
    if (chunks.some((chunk) => chunk.bytes === null)) {
      // TODO: error
    }

    const [headerChunk, sourcesChunk, targetsChunk, identitesChunk] = chunks;

    const decodedHeader = decodeHead(headerChunk.bytes);
    const decodedSources = decodeNodeIdColumn(
      sourcesChunk.bytes,
      headerChunk.sourcesCount,
    );
    const decodedTargets = decodeNodeIdColumn(
      targetsChunk.bytes,
      headerChunk.targetsCount,
    );
    const decodedIdentites = decodeIdentities(
      identitesChunk.bytes,
      headerChunk.identitiesCount,
    );

    const [header, sources, targets, identities] = yield* Result.all([
      decodedHeader,
      decodedSources,
      decodedTargets,
      decodedIdentites,
    ]);

    return {
      header,
      sources,
      targets,
      identities,
    };
  });
