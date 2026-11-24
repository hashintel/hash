/**
 * One encoded token as a column of memory: a group per field, a row per byte,
 * and beside each group what the field holds.
 */

import { getOwn } from "@hashintel/petrinaut-core";

import { formatValue } from "./format-value";
import { fieldHex, memoryGroups, stringPoolId } from "./token-memory";

import type { EncodedToken } from "./encode-token";
import type { ByteOrder, MemoryByte } from "./token-memory";
import type { TokenLayoutField } from "@hashintel/petrinaut-core";

/** How many field colours the stylesheet defines before they repeat. */
const hueCount = 6;

export const TokenMemoryView = ({
  token,
  byteOrder,
}: {
  token: EncodedToken;
  byteOrder: ByteOrder;
}) => {
  const { layout, bytes } = token;

  if (layout.fields.length === 0) {
    return <p className="pnd-box-note">Add a dimension to see its bytes.</p>;
  }

  return (
    <div className="pnd-memory">
      {memoryGroups(layout, bytes, byteOrder).map((group) => (
        <div
          key={group.byteOffset}
          className="pnd-memory-group"
          data-hue={
            group.field === null
              ? undefined
              : layout.fields.indexOf(group.field) % hueCount
          }
        >
          <div>
            {group.bytes.map((byte) => (
              <ByteRow key={byte.label} byte={byte} />
            ))}
          </div>
          {group.field === null ? (
            <div className="pnd-memory-note">
              <strong>padding</strong> {group.bytes.length} B, so the next token
              starts on an 8-byte boundary
            </div>
          ) : (
            <FieldNote token={token} field={group.field} />
          )}
        </div>
      ))}
      <p className="pnd-box-note">
        One token takes {layout.strideBytes} B.
        {layout.fields.some((field) => field.kind === "f64")
          ? " In an f64 the darkest bit is the sign, the next eleven are the exponent and the lightest are the mantissa."
          : null}
      </p>
    </div>
  );
};

const ByteRow = ({ byte }: { byte: MemoryByte }) => (
  <div className="pnd-memory-byte">
    <span className="pnd-memory-label">{byte.label}</span>
    {byte.bits.length === 0 ? (
      <span className="pnd-memory-padding" />
    ) : (
      byte.bits.map((bit, index) => (
        <span key={index} className="pnd-memory-bit" data-part={bit.part}>
          {bit.value}
        </span>
      ))
    )}
  </div>
);

const FieldNote = ({
  token,
  field,
}: {
  token: EncodedToken;
  field: TokenLayoutField;
}) => {
  const { name, type } = field.element;
  // Read the way the codec reads it: an own property, or nothing.
  const written = formatValue(getOwn(token.input, name));
  const readBack = formatValue(token.decoded[name]);
  // A string leaves its text in the pool and only an id in the token.
  const stored =
    field.kind === "u64"
      ? `stored as pool id ${stringPoolId(token.bytes, field)}, `
      : "";

  return (
    <div className="pnd-memory-note">
      <div>
        <strong>{name}</strong>{" "}
        {`${type} → ${field.kind}, offset ${field.byteOffset}, ${field.byteSize} B`}
      </div>
      <div>
        <code>{fieldHex(token.bytes, field)}</code>
      </div>
      <div>{`wrote ${written}, ${stored}reads back ${readBack}`}</div>
    </div>
  );
};
