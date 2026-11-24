import { SlideFrame, useCompleteStep, useSteps } from "@archinaut/slides";

export const title = "A step can wait for an animation";
export const notes = {
  default:
    "useCompleteStep returns a function that moves the slide to its next step. Called when the bar's animation ends, it advances the deck without a key press.",
  byStep: {
    1: "The bar fills over two seconds. Press nothing.",
    2: "The animation's end moved the deck to step 2.",
  },
};

const states = ["idle", "running", "done"] as const;

const Wait = () => {
  const { step } = useSteps(states.length);
  const complete = useCompleteStep();
  const state = states[step] ?? "done";
  return (
    <SlideFrame
      title="This bar moves the deck on when it fills"
      takeaway="Step 2 came from the animation's end, not from a key."
      takeawayAt={2}
    >
      <div className="tsx-fill" data-state={state}>
        <div
          className="tsx-fill__bar"
          onAnimationEnd={state === "running" ? complete : undefined}
        />
      </div>
    </SlideFrame>
  );
};

export default Wait;
