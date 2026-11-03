/**
 * The deck laid out for paper: every slide at its last step, one per page,
 * with its notes under it. `archinaut build --pdf` prints this route; a
 * browser's print dialog does the same.
 */

import { MDXProvider } from "@mdx-js/react";
import { useEffect } from "react";

import "./styles/print.css";
import { SlideContent } from "./deck/slide-content";
import { slideMdxComponents } from "./mdx-components";
import { noteFor, type LoadedSlide } from "./slide-module";
import { SlideStepContext } from "./step-context";

import type { DeckSummary } from "./decks";

const ignore = (): void => {};

/** Every distinct note of the slide, in step order. */
const notesOf = (slide: LoadedSlide): string => {
  const steps = Math.max(
    slide.declaredSteps ?? 1,
    ...Object.keys(slide.notes.byStep ?? {}).map((step) => Number(step) + 1),
  );
  return [
    ...new Set(
      Array.from({ length: steps }, (_, step) => noteFor(slide.notes, step)),
    ),
  ]
    .filter((note) => note !== "")
    .join(" ");
};

export const DeckPrint = ({
  deck,
  slides,
}: {
  deck: DeckSummary;
  slides: readonly LoadedSlide[];
}) => {
  useEffect(() => {
    document.title = `${deck.title} · Print`;
  }, [deck.title]);
  return (
    <div className="deck-print">
      <MDXProvider components={slideMdxComponents}>
        {slides.map((slide) => (
          <section className="deck-print__page" key={slide.id}>
            <div className="deck deck-print__stage">
              <SlideStepContext
                value={{
                  slideId: slide.id,
                  step: (slide.declaredSteps ?? 1) - 1,
                  mode: "final",
                  registerSteps: ignore,
                  completeStep: ignore,
                }}
              >
                <SlideContent slide={slide} />
              </SlideStepContext>
            </div>
            <p className="deck-print__notes">{notesOf(slide)}</p>
          </section>
        ))}
      </MDXProvider>
    </div>
  );
};
