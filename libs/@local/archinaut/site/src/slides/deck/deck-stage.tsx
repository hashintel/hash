/**
 * The slide on its canvas: the deck's header over the current slide at its
 * step, inside the slide context. The deck view and the exported player
 * both draw it, each with its own chrome around it.
 */

import { MDXProvider } from "@mdx-js/react";

import { StepContext } from "../../steps/context";
import { slideMdxComponents } from "../mdx-components";
import { SlideContent } from "./slide-content";
import { SlideHead } from "./slide-head";

import type { DeckLogo } from "../decks";
import type { DeckControls } from "./use-deck";
import type { Ref } from "react";

export const DeckStage = ({
  logo,
  controls,
  canvasRef,
  overflowing = false,
}: {
  logo: DeckLogo;
  controls: DeckControls;
  canvasRef?: Ref<HTMLDivElement>;
  overflowing?: boolean;
}) => {
  const { state, slide, registerSteps, completeStep } = controls;
  return (
    <div className="deck-stage">
      <div
        ref={canvasRef}
        className="deck-canvas"
        data-overflowing={overflowing}
      >
        <MDXProvider components={slideMdxComponents}>
          <StepContext
            value={{
              scope: slide.id,
              step: state.step,
              mode: "live",
              registerSteps,
              completeStep,
            }}
          >
            <SlideHead logo={logo} label={slide.label} />
            <SlideContent key={slide.id} slide={slide} />
          </StepContext>
        </MDXProvider>
      </div>
    </div>
  );
};
