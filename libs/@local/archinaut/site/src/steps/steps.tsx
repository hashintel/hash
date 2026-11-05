/**
 * A figure whose parts arrive step by step: a drawing, a formula, or any
 * reveals, together. On a slide it adds nothing: the slide counts its
 * steps and the presenter steps through them. On a docs page it plays
 * itself as it comes into view (see `use-player.ts`), offers to play
 * again once it has, and prints its last step. There, the compile writes `count`, the number of
 * steps, and wraps each stepped part a page leaves outside a `Steps` block
 * in one of its own.
 */

import { use, useId, useRef, type ReactNode } from "react";

import { StepContext } from "./context";
import { usePlayer } from "./use-player";
import { usePrinting } from "./use-printing";
import "./steps.css";

interface StepsProps {
  /** How many steps the block has, its first included. */
  count?: number;
  children: ReactNode;
}

const Player = ({ count = 1, children }: StepsProps) => {
  const scope = useId();
  const block = useRef<HTMLDivElement>(null);
  const { state, replay, register, complete } = usePlayer(count, block);
  const printing = usePrinting();
  return (
    <div ref={block} className="steps" data-phase={state.phase}>
      <StepContext
        value={{
          scope,
          step: printing ? state.count - 1 : state.step,
          mode: printing ? "final" : "live",
          registerSteps: register,
          completeStep: complete,
        }}
      >
        {children}
      </StepContext>
      {state.phase === "done" ? (
        <button type="button" className="steps__replay" onClick={replay}>
          Replay
        </button>
      ) : null}
    </div>
  );
};

export const Steps = ({ count, children }: StepsProps) =>
  use(StepContext) === null ? (
    <Player count={count}>{children}</Player>
  ) : (
    children
  );
