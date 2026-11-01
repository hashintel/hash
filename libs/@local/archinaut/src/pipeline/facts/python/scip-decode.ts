/**
 * Reads the three fields of a SCIP index the model needs, straight from the
 * protobuf wire format: `Index.documents` (field 2), each document's
 * `relative_path` (1) and `occurrences` (2), and each occurrence's `symbol`
 * (2) and `symbol_roles` (3). Everything else is skipped by wire type, so
 * the full generated bindings and their runtime are not needed.
 */

export interface ScipOccurrence {
  symbol: string;
  symbolRoles: number;
}

export interface ScipDocument {
  relativePath: string;
  occurrences: ScipOccurrence[];
}

/** `symbol_roles` bit set on an occurrence that defines its symbol. */
export const scipDefinitionRole = 1;

const wireType = {
  varint: 0,
  fixed64: 1,
  lengthDelimited: 2,
  fixed32: 5,
} as const;

interface Field {
  number: number;
  /** The varint's value, or the bytes of a length-delimited field. */
  value: number | Uint8Array;
}

const decoder = new TextDecoder();

/** Iterates the fields of one protobuf message. */
function* fields(bytes: Uint8Array): Generator<Field> {
  let offset = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = bytes[offset];
      if (byte === undefined) {
        throw new Error("truncated varint in SCIP index");
      }
      offset += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7;
    }
  };
  while (offset < bytes.length) {
    const tag = varint();
    const number = Math.floor(tag / 8);
    switch (tag % 8) {
      case wireType.varint:
        yield { number, value: varint() };
        break;
      case wireType.lengthDelimited: {
        const length = varint();
        yield { number, value: bytes.subarray(offset, offset + length) };
        offset += length;
        break;
      }
      case wireType.fixed64:
        offset += 8;
        break;
      case wireType.fixed32:
        offset += 4;
        break;
      default:
        throw new Error(`unsupported wire type ${tag % 8} in SCIP index`);
    }
  }
}

const bytesOf = (field: Field): Uint8Array =>
  typeof field.value === "number" ? new Uint8Array() : field.value;

const decodeOccurrence = (bytes: Uint8Array): ScipOccurrence => {
  const occurrence: ScipOccurrence = { symbol: "", symbolRoles: 0 };
  for (const field of fields(bytes)) {
    if (field.number === 2) {
      occurrence.symbol = decoder.decode(bytesOf(field));
    } else if (field.number === 3 && typeof field.value === "number") {
      occurrence.symbolRoles = field.value;
    }
  }
  return occurrence;
};

const decodeDocument = (bytes: Uint8Array): ScipDocument => {
  const document: ScipDocument = { relativePath: "", occurrences: [] };
  for (const field of fields(bytes)) {
    if (field.number === 1) {
      document.relativePath = decoder.decode(bytesOf(field));
    } else if (field.number === 2) {
      document.occurrences.push(decodeOccurrence(bytesOf(field)));
    }
  }
  return document;
};

export const decodeScipIndex = (bytes: Uint8Array): ScipDocument[] => {
  const documents: ScipDocument[] = [];
  for (const field of fields(bytes)) {
    if (field.number === 2) {
      documents.push(decodeDocument(bytesOf(field)));
    }
  }
  return documents;
};
