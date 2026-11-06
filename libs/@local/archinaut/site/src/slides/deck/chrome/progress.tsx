/** The deck's progress, counting the steps of the current slide as fractions of it. */

export const Progress = ({
  index,
  total,
  step,
  steps,
}: {
  index: number;
  total: number;
  step: number;
  steps: number;
}) => (
  <progress
    className="deck-progress"
    aria-label="Presentation progress"
    value={index + (step + 1) / steps}
    max={total}
  />
);

export const SlideCounter = ({
  current,
  total,
}: {
  current: number;
  total: number;
}) => (
  <div className="deck-counter">
    {current} / {total}
  </div>
);
