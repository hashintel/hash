/**
 * The controls under a docs page's `Steps` block: a slider through its
 * steps, with a mark for each, and a replay button at its right. Both stay
 * faint until the pointer is over the block or one of them has focus. The
 * slider follows the steps as the block plays, and dragging it stops the
 * block on the step it reaches; replay shows whenever the block is not
 * playing. Replay hides once pressed, so a keyboard press hands focus to
 * the slider rather than dropping it.
 */

import { useRef } from "react";

import { RotateIcon } from "@hashintel/ds-icons";

export const StepControls = ({
  step,
  count,
  playing,
  onSeek,
  onReplay,
}: {
  step: number;
  count: number;
  playing: boolean;
  onSeek: (step: number) => void;
  onReplay: () => void;
}) => {
  const slider = useRef<HTMLInputElement>(null);
  return (
    <div className="steps__controls">
      <div className="steps__track">
        <span className="steps__marks" aria-hidden>
          {Array.from({ length: count }, (_, index) => (
            <span key={index} data-reached={index <= step} />
          ))}
        </span>
        <input
          ref={slider}
          type="range"
          className="steps__slider"
          min={0}
          max={count - 1}
          step={1}
          value={step}
          aria-label="Step"
          aria-valuetext={`Step ${step + 1} of ${count}`}
          style={{ "--steps-progress": `${(step / (count - 1)) * 100}%` }}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>
      <button
        type="button"
        className="steps__replay"
        aria-label="Replay"
        title="Replay"
        data-available={!playing}
        disabled={playing}
        onClick={(event) => {
          onReplay();
          // A click from the keyboard reports no pointer clicks.
          if (event.detail === 0) {
            slider.current?.focus();
          }
        }}
      >
        <RotateIcon size={14} />
      </button>
    </div>
  );
};
