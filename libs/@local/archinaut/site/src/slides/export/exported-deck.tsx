/**
 * The player inside an exported deck: the slides with their steps and
 * motion, the arrow keys, a click or tap to step on, the progress bar and
 * the slide counter. The deck view's other features stay behind: settings,
 * the presenter window, the overflow flag and the way back to the decks.
 */

import { useEffect, useEffectEvent } from "react";

import { currentStepCount } from "../deck-state";
import { Progress, SlideCounter } from "../deck/chrome/progress";
import { DeckStage } from "../deck/deck-stage";
import { useDeck } from "../deck/use-deck";

import type { SlideShape } from "../deck/slide-shape";
import type { DeckLogo } from "../decks";
import type { LoadedSlide } from "../slide-module";

const followsLink = (target: EventTarget): boolean =>
  target instanceof Element &&
  target.closest("a, button, input, select, textarea") !== null;

export const ExportedDeck = ({
  logo,
  shape,
  slides,
}: {
  logo: DeckLogo;
  shape: SlideShape;
  slides: readonly LoadedSlide[];
}) => {
  const controls = useDeck(slides);
  const { state } = controls;
  // On the document, like the deck's keys, so the slide stays a plain region.
  const onClick = useEffectEvent((event: MouseEvent): void => {
    if (event.target !== null && !followsLink(event.target)) {
      controls.forward();
    }
  });
  useEffect(() => {
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <div className="deck" data-shape={shape}>
      <DeckStage logo={logo} controls={controls} />
      <Progress
        index={state.index}
        total={slides.length}
        step={state.step}
        steps={currentStepCount(state, slides)}
      />
      <SlideCounter current={state.index + 1} total={slides.length} />
    </div>
  );
};
