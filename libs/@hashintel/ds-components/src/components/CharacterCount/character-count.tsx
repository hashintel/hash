import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./character-count.recipe";

export const CharacterCount = ({
  className,
  charactersUsed,
  maxLength,
  takesHeight = false,
}: {
  className?: string;
  /** The number of characters currently entered */
  charactersUsed: number;
  /** The maximum number of characters allowed */
  maxLength: number;
  /** Whether the counter occupies vertical space in the layout. defaults to false */
  takesHeight?: boolean;
}) => {
  const overLimit = charactersUsed > maxLength;

  return (
    <div
      className={cx(styles({ overLimit, takesHeight }), className)}
      // only announce to assistive tech once the user has exceeded the limit,
      // to avoid narrating the count on every keystroke
      aria-live={overLimit ? "polite" : "off"}
    >
      {charactersUsed}/{maxLength}
    </div>
  );
};
