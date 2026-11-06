import { Morph, SlideFrame, useSlideStepper } from "@archinaut/slides";

interface SortFrame {
  values: readonly number[];
  /** The two positions the step compared. */
  compared: readonly [number, number] | null;
  note: string;
}

/** Bubble sort, one frame per comparison. */
const bubbleSort = (input: readonly number[]): [SortFrame, ...SortFrame[]] => {
  const values = [...input];
  const frames: [SortFrame, ...SortFrame[]] = [
    { values: [...values], compared: null, note: "Four values, unsorted." },
  ];
  for (let end = values.length - 1; end > 0; end--) {
    for (let i = 0; i < end; i++) {
      const left = values[i];
      const right = values[i + 1];
      if (left === undefined || right === undefined) {
        continue;
      }
      if (left > right) {
        values[i] = right;
        values[i + 1] = left;
      }
      frames.push({
        values: [...values],
        compared: [i, i + 1],
        note:
          left > right
            ? `${left} > ${right}: swap.`
            : `${left} < ${right}: keep.`,
      });
    }
  }
  return frames;
};

const frames = bubbleSort([4, 1, 3, 2]);

export const title = "useSlideStepper declares the steps";
export const notes =
  "useSlideStepper(n) declares the slide's step count as it renders and returns the current step; the bars are drawn from it. Each bar is a Morph named by its value, so a swap glides.";

const Sort = () => {
  const { step } = useSlideStepper(frames.length);
  const frame = frames[step] ?? frames[0];
  return (
    <SlideFrame title="Each step is one comparison" takeaway={frame.note}>
      <div className="tsx-sort">
        {frame.values.map((value, position) => (
          <Morph key={value} name={`sort-${value}`}>
            <span
              className="tsx-sort__bar"
              data-compared={frame.compared?.includes(position) ?? false}
              style={{ height: `${value * 4.75}rem` }}
            >
              {value}
            </span>
          </Morph>
        ))}
      </div>
    </SlideFrame>
  );
};

export default Sort;
