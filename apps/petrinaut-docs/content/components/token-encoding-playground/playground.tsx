/**
 * The playground itself: the dimensions of a token type, one token of that
 * type, and the bytes the engine's codec packs the token into.
 */

import "./playground.css";
import { useId, useState } from "react";

import { DimensionList } from "./dimension-list";
import { encodeTokenSource } from "./encode-token";
import { TokenMemoryView } from "./token-memory-view";

import type { Dimension } from "./encode-token";
import type { ByteOrder } from "./token-memory";

const initialDimensions: Dimension[] = [
  { name: "amount", type: "real" },
  { name: "count", type: "integer" },
  { name: "active", type: "boolean" },
];

const initialSource = `{
  amount: 1.25,
  count: 2.7,
  active: true,
}`;

const byteOrders: { value: ByteOrder; label: string }[] = [
  { value: "logical", label: "Most significant byte first" },
  { value: "memory", label: "Memory order, little-endian" },
];

export const Playground = () => {
  const [dimensions, setDimensions] = useState(initialDimensions);
  const [source, setSource] = useState(initialSource);
  const [byteOrder, setByteOrder] = useState<ByteOrder>("logical");
  const id = useId();
  const encoding = encodeTokenSource(dimensions, source);

  return (
    // `not-content` keeps the site's prose spacing off the rows in here.
    <div className="pnd-playground not-content">
      <div className="pnd-playground-inputs">
        <div>
          <span className="pnd-lane-title">Dimensions</span>
          <DimensionList dimensions={dimensions} onChange={setDimensions} />
        </div>
        <div>
          <label className="pnd-lane-title" htmlFor={`${id}-source`}>
            Token
          </label>
          <textarea
            id={`${id}-source`}
            rows={6}
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="pnd-box-note">
            A JavaScript object. A dimension it leaves out takes the default of
            its type.
          </div>
        </div>
      </div>

      <div
        className="pnd-playground-order"
        role="radiogroup"
        aria-label="Byte order"
      >
        {byteOrders.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name={`${id}-order`}
              checked={byteOrder === value}
              onChange={() => setByteOrder(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {"error" in encoding ? (
        <pre className="pnd-playground-error" role="alert">
          {encoding.error}
        </pre>
      ) : (
        <TokenMemoryView token={encoding} byteOrder={byteOrder} />
      )}
    </div>
  );
};
