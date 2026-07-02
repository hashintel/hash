import { css } from "@hashintel/ds-helpers/css";

import { f64BitPart, getFieldBits, getFieldHex } from "./physical-layout";

import type { LayoutField, TokenLayout } from "./physical-layout";
import type { TokenRecord } from "@hashintel/petrinaut-core";

export type BitOrder = "logical" | "memory";

export type TokenMemoryViewProps = {
  layout: TokenLayout;
  buffer: ArrayBuffer;
  /** Raw values returned by the user's code, before coercion. */
  input: Record<string, unknown>;
  stored: TokenRecord;
  decoded: TokenRecord;
  bitOrder: BitOrder;
};

// One hue per field, cycled. Lightness encodes the IEEE-754 part.
const FIELD_HUES = [217, 27, 271, 162, 336, 195];

const fieldColor = (fieldIndex: number, lightness: number): string =>
  `hsl(${FIELD_HUES[fieldIndex % FIELD_HUES.length]!} 75% ${lightness}%)`;

const bitLightness = (field: LayoutField, msbFirstIndex: number): number => {
  if (field.physical.kind !== "f64") {
    return 78;
  }
  switch (f64BitPart(msbFirstIndex)) {
    case "sign":
      return 52;
    case "exponent":
      return 68;
    case "mantissa":
      return 86;
  }
};

// -- Styles ---------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  fontSize: "xs",
});

const legendStyle = css({
  display: "flex",
  flexWrap: "wrap",
  rowGap: "1.5",
  columnGap: "4",
  alignItems: "center",
  color: "neutral.s100",
});

const legendChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  "& i": {
    display: "inline-block",
    width: "3",
    height: "3",
    borderRadius: "xs",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "[rgba(0,0,0,0.25)]",
  },
});

const fieldRowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const fieldHeaderStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  rowGap: "1",
  columnGap: "3",
  fontFamily: "mono",

  "& b": {
    fontSize: "sm",
  },
  "& span": {
    color: "neutral.s90",
  },
});

const byteGroupsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1",
});

const byteStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.5",
});

const bitRowStyle = css({
  display: "flex",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[rgba(0,0,0,0.35)]",
  borderRadius: "xs",
  overflow: "hidden",
});

const bitStyle = css({
  width: "[13px]",
  height: "[16px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[9px]",
  fontFamily: "mono",
  color: "[rgba(0,0,0,0.75)]",

  "& + &": {
    borderLeftWidth: "[1px]",
    borderLeftStyle: "solid",
    borderLeftColor: "[rgba(0,0,0,0.12)]",
  },
});

const byteLabelStyle = css({
  fontFamily: "mono",
  fontSize: "[9px]",
  color: "neutral.s80",
});

const roundTripStyle = css({
  fontFamily: "mono",
  fontSize: "[11px]",
  color: "neutral.s100",

  "& b": {
    color: "neutral.s110",
  },
});

const strideNoteStyle = css({
  color: "neutral.s90",
});

// -- Helpers ----------------------------------------------------------------

const formatValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : String(value);
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
};

type ByteCell = {
  /** Absolute byte index within the token stride. */
  byteIndex: number;
  /** Bits to render left→right. */
  bits: { value: number; lightness: number }[];
  owner: { field: LayoutField; fieldIndex: number } | null;
};

/** Bytes in buffer order (memory view), each annotated with its owner. */
function buildMemoryBytes(
  layout: TokenLayout,
  buffer: ArrayBuffer,
): ByteCell[] {
  const bytes = new Uint8Array(buffer);
  const cells: ByteCell[] = [];
  for (let byteIndex = 0; byteIndex < layout.strideBytes; byteIndex++) {
    const fieldIndex = layout.fields.findIndex(
      (field) =>
        byteIndex >= field.byteOffset &&
        byteIndex < field.byteOffset + field.physical.byteSize,
    );
    const field = fieldIndex >= 0 ? layout.fields[fieldIndex]! : null;
    const bits = [];
    for (let bit = 7; bit >= 0; bit--) {
      // eslint-disable-next-line no-bitwise -- bit extraction is the point here
      const value = ((bytes[byteIndex] ?? 0) >> bit) & 1;
      let lightness = 78;
      if (field) {
        // Map this memory bit back to its MSB-first logical index so the
        // IEEE-754 shading survives the little-endian byte order.
        const byteWithinField = byteIndex - field.byteOffset;
        const lsbFirstIndex = byteWithinField * 8 + bit;
        const msbFirstIndex = field.physical.byteSize * 8 - 1 - lsbFirstIndex;
        lightness = bitLightness(field, msbFirstIndex);
      }
      bits.push({ value, lightness });
    }
    cells.push({
      byteIndex,
      bits,
      owner: field ? { field, fieldIndex } : null,
    });
  }
  return cells;
}

// -- Component ----------------------------------------------------------------

/**
 * Renders one encoded token as its raw bits. Built against the format-v2
 * abstraction (`TokenLayout`): any mix of field widths and padding renders,
 * not just uniform f64 slots.
 */
export const TokenMemoryView: React.FC<TokenMemoryViewProps> = ({
  layout,
  buffer,
  input,
  stored,
  decoded,
  bitOrder,
}) => {
  if (layout.fields.length === 0) {
    return (
      <div className={containerStyle}>
        <span className={strideNoteStyle}>
          Add at least one dimension to see the encoded token.
        </span>
      </div>
    );
  }

  const hasF64 = layout.fields.some((field) => field.physical.kind === "f64");

  return (
    <div className={containerStyle}>
      <div className={legendStyle}>
        {layout.fields.map((field, fieldIndex) => (
          <span key={field.name} className={legendChipStyle}>
            <i style={{ background: fieldColor(fieldIndex, 70) }} />
            {field.name} · {field.physical.kind}
          </span>
        ))}
        <span className={legendChipStyle}>
          <i
            style={{
              background:
                "repeating-linear-gradient(45deg, #eee, #eee 2px, #ccc 2px, #ccc 4px)",
            }}
          />
          padding
        </span>
        {hasF64 ? (
          <span className={strideNoteStyle}>
            f64 shading: dark = sign · medium = exponent · light = mantissa
          </span>
        ) : null}
        <span className={strideNoteStyle}>
          sizeof(token) = {layout.strideBytes} B ({layout.mode})
        </span>
      </div>

      {bitOrder === "logical" ? (
        layout.fields.map((field, fieldIndex) => {
          const bits = getFieldBits(buffer, field);
          return (
            <div key={field.name} className={fieldRowStyle}>
              <div className={fieldHeaderStyle}>
                <b style={{ color: fieldColor(fieldIndex, 35) }}>
                  {field.name}
                </b>
                <span>
                  {field.elementType} → {field.physical.kind} · offset{" "}
                  {field.byteOffset} · {field.physical.byteSize} B ·{" "}
                  {getFieldHex(buffer, field)}
                </span>
              </div>
              <div className={byteGroupsStyle}>
                {Array.from(
                  { length: field.physical.byteSize },
                  (_, groupIndex) => (
                    <div key={groupIndex} className={byteStyle}>
                      <div className={bitRowStyle}>
                        {bits
                          .slice(groupIndex * 8, groupIndex * 8 + 8)
                          .map((bit, bitInGroup) => {
                            const msbFirstIndex = groupIndex * 8 + bitInGroup;
                            return (
                              <span
                                // eslint-disable-next-line react/no-array-index-key -- bits are purely positional
                                key={bitInGroup}
                                className={bitStyle}
                                style={{
                                  background: fieldColor(
                                    fieldIndex,
                                    bitLightness(field, msbFirstIndex),
                                  ),
                                }}
                              >
                                {bit}
                              </span>
                            );
                          })}
                      </div>
                      <span className={byteLabelStyle}>
                        bits {field.physical.byteSize * 8 - 1 - groupIndex * 8}–
                        {field.physical.byteSize * 8 - 8 - groupIndex * 8}
                      </span>
                    </div>
                  ),
                )}
              </div>
              <div className={roundTripStyle}>
                input {formatValue(input[field.name])} → stored{" "}
                <b>{formatValue(stored[field.name])}</b> → reads back{" "}
                <b>{formatValue(decoded[field.name])}</b>
              </div>
            </div>
          );
        })
      ) : (
        <div className={fieldRowStyle}>
          <div className={fieldHeaderStyle}>
            <b>buffer bytes 0–{layout.strideBytes - 1}</b>
            <span>
              little-endian memory order · bits shown 7→0 within each byte
            </span>
          </div>
          <div className={byteGroupsStyle}>
            {buildMemoryBytes(layout, buffer).map((cell) => (
              <div key={cell.byteIndex} className={byteStyle}>
                <div className={bitRowStyle}>
                  {cell.bits.map((bit, bitIndex) => (
                    <span
                      // eslint-disable-next-line react/no-array-index-key -- bits are purely positional
                      key={bitIndex}
                      className={bitStyle}
                      style={{
                        background: cell.owner
                          ? fieldColor(cell.owner.fieldIndex, bit.lightness)
                          : "repeating-linear-gradient(45deg, #eee, #eee 2px, #ccc 2px, #ccc 4px)",
                      }}
                    >
                      {bit.value}
                    </span>
                  ))}
                </div>
                <span className={byteLabelStyle}>
                  b{cell.byteIndex}
                  {cell.owner ? ` ${cell.owner.field.name}` : " pad"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
