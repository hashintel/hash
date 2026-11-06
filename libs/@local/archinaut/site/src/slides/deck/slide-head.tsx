/**
 * The top-left corner of every slide: the deck's logo, then the slide's
 * label. It sits on the canvas beside the slide, so it scales with a fixed
 * shape and prints; the label carries its own view-transition name and
 * moves with the slide while the logo holds still.
 */

import siteLogoUrl from "../../content/logo.png";
import { HashLogo } from "./hash-logo";

import type { DeckLogo } from "../decks";

const Logo = ({ logo }: { logo: DeckLogo }) => {
  switch (logo.kind) {
    case "site":
      return <img className="deck-head__logo" src={siteLogoUrl} alt="" />;
    case "hash":
      return <HashLogo className="deck-head__logo" />;
    case "image":
      return <img className="deck-head__logo" src={logo.src} alt="" />;
    case "none":
      return null;
  }
};

export const SlideHead = ({
  logo,
  label,
}: {
  logo: DeckLogo;
  label: string | null;
}) =>
  logo.kind === "none" && label === null ? null : (
    <header className="deck-head">
      <Logo logo={logo} />
      {label === null ? null : (
        <span className="deck-head__label">{label}</span>
      )}
    </header>
  );
