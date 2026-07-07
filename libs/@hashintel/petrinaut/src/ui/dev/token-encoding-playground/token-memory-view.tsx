import { useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";
import { formatUuid } from "@hashintel/petrinaut-core";

import { f64BitPart } from "./physical-layout";

import type {
  TokenLayoutField,
  TokenRecord,
  TokenSlotLayout,
} from "@hashintel/petrinaut-core";

export type BitOrder = "logical" | "memory";

export type TokenMemoryViewProps = {
  layout: TokenSlotLayout;
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

const PADDING_BACKGROUND =
  "repeating-linear-gradient(45deg, #f2f2f2, #f2f2f2 2px, #d8d8d8 2px, #d8d8d8 4px)";

const bitLightness = (
  field: TokenLayoutField,
  msbFirstIndex: number,
): number => {
  // Only f64 fields get IEEE-754 anatomy shading; u8 and u64x2 (uuid) fields
  // are plain integers, rendered with one uniform lightness.
  if (field.kind !== "f64") {
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

// -- Group model ------------------------------------------------------------

type BitCell = { value: number; lightness: number };

type ByteRow = {
  /** Absolute byte index within the token stride, e.g. `b12`. */
  label: string;
  bits: BitCell[];
};

type SlotGroup = {
  key: string;
  field: TokenLayoutField | null; // null = padding
  fieldIndex: number;
  startByte: number;
  rows: ByteRow[];
};

/**
 * One group per field (and per padding range), each holding one row per byte
 * (8 bits). `logical` order lists the most-significant byte first; `memory`
 * order follows the buffer (little-endian: least-significant byte first).
 */
function buildSlotGroups(
  layout: TokenSlotLayout,
  buffer: ArrayBuffer,
  bitOrder: BitOrder,
): SlotGroup[] {
  const bytes = new Uint8Array(buffer);
  const groups: SlotGroup[] = [];

  for (const [fieldIndex, field] of layout.fields.entries()) {
    const size = field.byteSize;
    const byteIndices = Array.from({ length: size }, (_, position) =>
      bitOrder === "logical" ? size - 1 - position : position,
    );
    groups.push({
      // Positional key: dimension names are user input and may collide.
      key: `field-${field.byteOffset}`,
      field,
      fieldIndex,
      startByte: field.byteOffset,
      rows: byteIndices.map((byteWithinField) => {
        const byteIndex = field.byteOffset + byteWithinField;
        const bits: BitCell[] = [];
        for (let bit = 7; bit >= 0; bit--) {
          // eslint-disable-next-line no-bitwise -- bit extraction is the point here
          const value = ((bytes[byteIndex] ?? 0) >> bit) & 1;
          const lsbFirstIndex = byteWithinField * 8 + bit;
          const msbFirstIndex = size * 8 - 1 - lsbFirstIndex;
          bits.push({ value, lightness: bitLightness(field, msbFirstIndex) });
        }
        // uuid fields are two 64-bit lanes: lo at the field offset, hi at +8.
        const lane =
          field.kind === "u64x2" ? (byteWithinField < 8 ? " lo" : " hi") : "";
        return { label: `b${byteIndex}${lane}`, bits };
      }),
    });
  }

  for (const range of layout.paddingRanges) {
    groups.push({
      key: `padding-${range.start}`,
      field: null,
      fieldIndex: -1,
      startByte: range.start,
      rows: Array.from({ length: range.end - range.start }, (_, offset) => ({
        label: `b${range.start + offset}`,
        bits: Array.from({ length: 8 }, () => ({ value: 0, lightness: 0 })),
      })),
    });
  }

  return groups.sort((a, b) => a.startByte - b.startByte);
}

// -- Styles -------------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  gap: "4",
  alignItems: "flex-start",
  fontSize: "xs",
});

const legendStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  width: "[170px]",
  flexShrink: 0,
  color: "neutral.s100",
});

const legendChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  cursor: "default",
  fontFamily: "mono",

  "& i": {
    display: "inline-block",
    width: "3",
    height: "3",
    borderRadius: "xs",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "[rgba(0,0,0,0.25)]",
    flexShrink: 0,
  },
});

const legendNoteStyle = css({
  color: "neutral.s90",
  fontSize: "[10px]",
  lineHeight: "[1.35]",
});

const gridStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flexShrink: 0,
});

const groupStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "xs",
    outlineWidth: "[2px]",
    outlineStyle: "solid",
    outlineOffset: "[1px]",
    transition: "[outline-color 0.1s ease]",
  },
  variants: {
    isHighlighted: {
      true: {},
      false: { outlineColor: "[transparent]" },
    },
  },
});

const byteRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const byteLabelStyle = css({
  width: "[44px]",
  textAlign: "right",
  fontFamily: "mono",
  fontSize: "[9px]",
  color: "neutral.s80",
  flexShrink: 0,
});

const bitRowStyle = css({
  display: "flex",
  overflow: "hidden",

  "& + &": {},
});

const bitStyle = css({
  width: "[13px]",
  height: "[13px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[8px]",
  fontFamily: "mono",
  color: "[rgba(0,0,0,0.72)]",
  borderWidth: "[0.5px]",
  borderStyle: "solid",
  borderColor: "[rgba(0,0,0,0.15)]",
});

const infoPanelStyle = css({
  flex: "[1]",
  minWidth: "[240px]",
  position: "sticky",
  top: "2",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  fontFamily: "mono",
  fontSize: "[11px]",
  color: "neutral.s100",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  padding: "2.5",
  minHeight: "[86px]",
});

const infoTitleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
});

const infoHintStyle = css({
  color: "neutral.s80",
  fontFamily: "[inherit]",
});

const roundTripStyle = css({
  "& b": {
    color: "neutral.s110",
  },
});

// -- Helpers --------------------------------------------------------------

const formatValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "bigint") {
    // uuid values are bigints at runtime; show the canonical string form.
    return formatUuid(value);
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    // stringify returns undefined for functions/symbols despite its typing.
    const json = JSON.stringify(value) as string | undefined;
    // eslint-disable-next-line typescript/no-base-to-string -- dev-tool display of arbitrary user values; default stringification is an acceptable last resort
    return json ?? String(value);
  } catch {
    // Cyclic objects (and other non-serializable user values) still render.
    // eslint-disable-next-line typescript/no-base-to-string -- same as above
    return String(value);
  }
};

/** Pool reference stored in a `u64` (string) field — IDs are small integers. */
const stringPoolId = (buffer: ArrayBuffer, field: TokenLayoutField): number =>
  Number(new BigUint64Array(buffer, field.byteOffset, 1)[0] ?? 0n);

const fieldHex = (buffer: ArrayBuffer, field: TokenLayoutField): string => {
  const bytes = new Uint8Array(buffer, field.byteOffset, field.byteSize);
  let hex = "";
  for (let byteIndex = bytes.length - 1; byteIndex >= 0; byteIndex--) {
    hex += bytes[byteIndex]!.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
};

// -- Component ----------------------------------------------------------------

/**
 * Renders one encoded token as a compact memory column: one byte (8 bits)
 * per row, grouped by slot. Hovering a slot (or its legend chip) highlights
 * the whole slot and reveals its details in the side panel. Built against
 * the engine's `TokenLayout` abstraction: any mix of field widths and
 * padding renders, not just uniform f64 slots.
 */
export const TokenMemoryView: React.FC<TokenMemoryViewProps> = ({
  layout,
  buffer,
  input,
  stored,
  decoded,
  bitOrder,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (layout.fields.length === 0) {
    return (
      <div className={containerStyle}>
        <span className={legendNoteStyle}>
          Add at least one dimension to see the encoded token.
        </span>
      </div>
    );
  }

  const groups = buildSlotGroups(layout, buffer, bitOrder);
  const hoveredGroup = groups.find((group) => group.key === hoveredKey) ?? null;
  const hasF64 = layout.fields.some((field) => field.kind === "f64");

  return (
    <div className={containerStyle}>
      {/* Left side: static legend */}
      <div className={legendStyle}>
        {layout.fields.map((field, fieldIndex) => (
          <span
            key={`field-${field.byteOffset}`}
            className={legendChipStyle}
            // Focusable chip: hover details must also be reachable by keyboard.
            role="button"
            tabIndex={0}
            onMouseEnter={() => setHoveredKey(`field-${field.byteOffset}`)}
            onMouseLeave={() => setHoveredKey(null)}
            onFocus={() => setHoveredKey(`field-${field.byteOffset}`)}
            onBlur={() => setHoveredKey(null)}
            onClick={() => setHoveredKey(`field-${field.byteOffset}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setHoveredKey(`field-${field.byteOffset}`);
              }
            }}
          >
            <i style={{ background: fieldColor(fieldIndex, 70) }} />
            {field.element.name} · {field.kind}
          </span>
        ))}
        {layout.paddingRanges.length > 0 ? (
          <span className={legendChipStyle}>
            <i style={{ background: PADDING_BACKGROUND }} />
            padding
          </span>
        ) : null}
        <span className={legendNoteStyle}>
          sizeof(token) = {layout.strideBytes} B
        </span>
        {hasF64 ? (
          <span className={legendNoteStyle}>
            f64 shading: dark = sign · medium = exponent · light = mantissa
          </span>
        ) : null}
        <span className={legendNoteStyle}>
          {bitOrder === "logical"
            ? "rows: most-significant byte first"
            : "rows: buffer order (little-endian)"}
        </span>
      </div>

      {/* Middle: the memory column, one byte per row */}
      <div className={gridStyle}>
        {groups.map((group) => (
          <div
            key={group.key}
            className={groupStyle({ isHighlighted: hoveredKey === group.key })}
            style={
              hoveredKey === group.key
                ? {
                    outlineColor: group.field
                      ? fieldColor(group.fieldIndex, 45)
                      : "#999999",
                  }
                : undefined
            }
            onMouseEnter={() => setHoveredKey(group.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            {group.rows.map((row) => (
              <div key={row.label} className={byteRowStyle}>
                <span className={byteLabelStyle}>{row.label}</span>
                <div className={bitRowStyle}>
                  {row.bits.map((bit, bitIndex) => (
                    <span
                      // eslint-disable-next-line react/no-array-index-key -- bits are purely positional
                      key={bitIndex}
                      className={bitStyle}
                      style={{
                        background: group.field
                          ? fieldColor(group.fieldIndex, bit.lightness)
                          : PADDING_BACKGROUND,
                      }}
                    >
                      {group.field ? bit.value : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right side: details, only for the hovered slot */}
      <div className={infoPanelStyle}>
        {hoveredGroup === null ? (
          <span className={infoHintStyle}>
            Hover a slot (or a legend entry) for details.
          </span>
        ) : hoveredGroup.field === null ? (
          <>
            <span className={infoTitleStyle}>padding</span>
            <span>
              {hoveredGroup.rows.length} B — alignTo(…, 8) keeps consecutive
              tokens 8-byte aligned
            </span>
          </>
        ) : (
          <>
            <span
              className={infoTitleStyle}
              style={{ color: fieldColor(hoveredGroup.fieldIndex, 35) }}
            >
              {hoveredGroup.field.element.name}
            </span>
            <span>
              {hoveredGroup.field.element.type} → {hoveredGroup.field.kind} ·
              offset {hoveredGroup.field.byteOffset} ·{" "}
              {hoveredGroup.field.byteSize} B
            </span>
            <span>{fieldHex(buffer, hoveredGroup.field)}</span>
            {hoveredGroup.field.kind === "u64" ? (
              // String fields store a pool reference, not the text: the
              // round-trip resolves through the simulation's string pool.
              <span className={roundTripStyle}>
                input {formatValue(input[hoveredGroup.field.element.name])} →
                pool id {stringPoolId(buffer, hoveredGroup.field)} →{" "}
                <b>{formatValue(decoded[hoveredGroup.field.element.name])}</b>
              </span>
            ) : (
              <span className={roundTripStyle}>
                input {formatValue(input[hoveredGroup.field.element.name])} →
                stored{" "}
                <b>{formatValue(stored[hoveredGroup.field.element.name])}</b> →
                reads back{" "}
                <b>{formatValue(decoded[hoveredGroup.field.element.name])}</b>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
