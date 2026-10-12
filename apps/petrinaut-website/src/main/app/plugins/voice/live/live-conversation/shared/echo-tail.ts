/**
 * An output stretch stays open this long after its last audible sample, for
 * room reverberation and provider event delivery. Output transcript fragments
 * further apart than this start a new output span.
 */
export const echoTailMs = 1_000;
