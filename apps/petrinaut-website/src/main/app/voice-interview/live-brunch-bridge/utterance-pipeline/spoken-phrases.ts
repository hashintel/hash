import { tokensOf } from "../../shared/classify-interruption";

// Elongated spellings ("ummm", "hmmm") are the same sound.
const hesitation =
  /^(?:u+h+|u+m+|u+h+m+|e+r+|e+r+m+|a+h+|h+m+|m+|m+h+m+|huh)$/u;

// Answer words such as "okay", "yes" and "right" are not filler: they can
// answer Brunch's last question.
const courtesy = new Set(["thanks", "thank", "you", "cheers"]);

const isHesitation = (token: string) => hesitation.test(token);

/** Every word is a hesitation sound, a backchannel such as "mm-hmm", or thanks. */
export const isFillerOnly = (text: string): boolean => {
  const tokens = tokensOf(text);
  return (
    tokens.length > 0 &&
    tokens.every((token) => isHesitation(token) || courtesy.has(token)) &&
    // "You" alone is a transcript, not thanks.
    // nosemgrep: ajinabraham.njsscan.crypto.timing_attack_node.node_timing_attack
    tokens.some((token) => token !== "you")
  );
};

const pause = "(?:(?:just |give me )?(?:a|one) (?:sec|second|moment|minute))";
const controlPhrases = new RegExp(
  `^(?:stop talking|stop|wait|pause|hold on|hang on|${pause})(?: (?:please|stop talking|stop|wait|pause|hold on|hang on|${pause}))*$`,
  "u",
);

/** Only asks Live to wait, hold on or stop, possibly around hesitation sounds. */
export const isControlOnly = (text: string): boolean =>
  controlPhrases.test(
    tokensOf(text)
      .filter((token) => !isHesitation(token))
      .join(" "),
  );
