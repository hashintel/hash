/**
 * A deck on screen: the current slide at its step inside the slide context,
 * under the deck's logo and the slide's label, drawn on a canvas that fills
 * the window or keeps the viewer's chosen shape, and the chrome around it. The shape is a data attribute; everything it
 * changes is in CSS.
 */

import { useEffect, useRef } from "react";

import { HashIconProvider } from "@hashintel/ds-icons";

import { currentStepCount } from "../deck-state";
import { usePresenterBroadcast } from "../presenter/use-presenter-broadcast";
import { noteFor } from "../slide-module";
import { ExportButton } from "./chrome/export-button";
import { HomeLink } from "./chrome/home-link";
import { OverflowAlert } from "./chrome/overflow-alert";
import { Progress, SlideCounter } from "./chrome/progress";
import { Settings, SettingsSelect, SettingsSwitch } from "./chrome/settings";
import { DeckStage } from "./deck-stage";
import { useDisplayOptions } from "./display-options";
import { slideShapeOptions } from "./slide-shape";
import { useDeck } from "./use-deck";
import { useSlideOverflow } from "./use-slide-overflow";

import type { DeckSummary } from "../decks";
import type { LoadedSlide } from "../slide-module";

export const Deck = ({
  deck,
  slides,
}: {
  deck: DeckSummary;
  slides: readonly LoadedSlide[];
}) => {
  const controls = useDeck(slides);
  const { state, slide } = controls;
  const steps = currentStepCount(state, slides);
  const { slideShape, setSlideShape, flagOverflow, setFlagOverflow } =
    useDisplayOptions();
  const canvasRef = useRef<HTMLDivElement>(null);
  const overflow = useSlideOverflow(canvasRef, flagOverflow);

  const following = slides[state.index + 1];
  const openPresenter = usePresenterBroadcast({
    deckId: deck.id,
    deckTitle: deck.title,
    slideId: slide.id,
    slideIndex: state.index,
    totalSlides: slides.length,
    step: state.step,
    totalSteps: steps,
    note: noteFor(slide.notes, state.step),
    nextNote:
      state.step < steps - 1
        ? noteFor(slide.notes, state.step + 1)
        : following === undefined
          ? ""
          : noteFor(following.notes, 0),
  });

  useEffect(() => {
    document.title = `${slide.title} · ${deck.title}`;
  }, [deck.title, slide.title]);

  return (
    <div className="deck" data-shape={slideShape}>
      <DeckStage
        logo={deck.logo}
        controls={controls}
        canvasRef={canvasRef}
        overflowing={overflow > 0}
      />
      <HashIconProvider size={16} weight={450}>
        <OverflowAlert overflow={overflow} />
        <Progress
          index={state.index}
          total={slides.length}
          step={state.step}
          steps={steps}
        />
        <SlideCounter current={state.index + 1} total={slides.length} />
        <HomeLink title={deck.title} />
        <Settings onOpenPresenter={openPresenter}>
          <SettingsSelect
            label="Slide shape"
            value={slideShape}
            options={slideShapeOptions}
            onChange={setSlideShape}
          />
          <SettingsSwitch
            label="Flag overflowing slides"
            checked={flagOverflow}
            onChange={setFlagOverflow}
          />
          {import.meta.env.DEV ? (
            <ExportButton deckId={deck.id} shape={slideShape} />
          ) : null}
        </Settings>
      </HashIconProvider>
    </div>
  );
};
