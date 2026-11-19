import { SlideFrame } from "@archinaut/slides";
import { useState } from "react";

import { addRolls, rollTwo, sums, waysToRoll } from "./components/dice.ts";
import { Histogram } from "./components/histogram.tsx";

export const title = "Rolls follow the 36 ways";
export const notes =
  "This TSX slide draws the same Histogram from rolls. The dice roll in the click handler, never during render, so the slide stays a pure function of its state. The marks show where each bar would stand if the rolls matched the 36 ways exactly.";

const empty = sums.map(() => 0);

const Rolls = () => {
  const [counts, setCounts] = useState<readonly number[]>(empty);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expected = waysToRoll.map((ways) => (ways / 36) * total);
  const roll = (times: number): void => {
    const rolls = Array.from({ length: times }, () => rollTwo(Math.random));
    setCounts((current) => addRolls(current, rolls));
  };
  return (
    <SlideFrame
      title="Rolls follow the 36 ways"
      takeaway={`${total} rolls so far.`}
    >
      <div className="dice-rolls">
        <Histogram counts={counts} expected={expected} highlight={7} />
        <div className="dice-rolls__controls">
          <button type="button" onClick={() => roll(10)}>
            Roll 10
          </button>
          <button type="button" onClick={() => roll(1000)}>
            Roll 1000
          </button>
          <button type="button" onClick={() => setCounts(empty)}>
            Reset
          </button>
        </div>
      </div>
    </SlideFrame>
  );
};

export default Rolls;
