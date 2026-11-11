import { SlideFrame } from "@archinaut/slides";
import { useState } from "react";

export const title = "A slide can hold state";
export const notes =
  "The rate is ordinary React state. The deck ignores keys pressed on an input, so the arrow keys move the slider while it has focus; click outside it to step on.";

const width = 600;
const height = 240;
const horizon = 10;
const capacity = 100;

/** Logistic growth from 1 towards the capacity. */
const population = (rate: number, time: number): number =>
  capacity / (1 + (capacity - 1) * Math.exp(-rate * time));

const curve = (rate: number): string =>
  Array.from({ length: 101 }, (_, index) => {
    const time = (index / 100) * horizon;
    const across = (time / horizon) * width;
    const down = height - (population(rate, time) / capacity) * height;
    return `${index === 0 ? "M" : "L"}${across.toFixed(1)} ${down.toFixed(1)}`;
  }).join(" ");

const State = () => {
  const [rate, setRate] = useState(1);
  return (
    <SlideFrame
      title="Drag the rate and the curve follows"
      takeaway="Logistic growth from 1 towards a capacity of 100."
    >
      <figure className="tsx-growth">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Population over ${horizon} time units at rate ${rate.toFixed(1)}`}
        >
          <path className="tsx-growth__axis" d={`M0 ${height}H${width}`} />
          <path className="tsx-growth__curve" d={curve(rate)} />
        </svg>
        <label className="tsx-growth__control">
          Rate
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
          />
          <output>{rate.toFixed(1)}</output>
        </label>
      </figure>
    </SlideFrame>
  );
};

export default State;
