/**
 * Stable `characterSet` for the label TextLayers, replacing `"auto"`.
 *
 * Why not `"auto"`: deck re-derives the set from the currently VISIBLE label
 * strings on every data change and stores it as a fresh `Set`; the TextLayer's
 * font-atlas manager compares that prop by reference, so every label rebuild
 * re-enters it and bumps the layer's `styleVersion` (regenerating the text
 * sublayer's attributes), and any character it has not rasterised yet
 * triggers a synchronous canvas re-raster plus a GPU texture upload -- right
 * as zoom crosses a label bucket, the regime where the render bench shows
 * hitches (see docs/PERFORMANCE.md, layer bisection).
 *
 * The replacement is one grow-only union per scene: seeded with printable
 * ASCII plus every character our worker-side label builders synthesise
 * themselves, extended with each character observed in actual label text.
 * The exposed array keeps its reference unless the union grew, so deck's
 * reference compare short-circuits and the atlas is left alone; when new
 * characters do arrive (new data), deck rasterises just the new glyphs into
 * its cached atlas once, at ingest rather than mid-zoom.
 */

/**
 * Characters the worker's label builders emit that are NOT printable ASCII:
 * `…` from property-value truncation (worker/store/property.ts), `→`/`←`
 * from link features (worker/hierarchy/cluster-feature-source.ts), plus
 * typographic dashes/quotes so user text stays safe under copy tweaks.
 */
const SYNTHESIZED_LABEL_CHARACTERS = "…→←–—\u2018\u2019\u201C\u201D";

function seedCharacters(): Set<string> {
  const seed = new Set<string>();
  // Printable ASCII (32..126), deck's own default atlas range.
  for (let code = 32; code < 127; code++) {
    seed.add(String.fromCharCode(code));
  }
  for (const character of SYNTHESIZED_LABEL_CHARACTERS) {
    seed.add(character);
  }
  return seed;
}

export class LabelCharacterSet {
  readonly #seen = seedCharacters();

  #stable: readonly string[] = [...this.#seen];

  /** The current set as an array whose reference only changes when the set grows. */
  get characters(): readonly string[] {
    return this.#stable;
  }

  /**
   * Union in every character (code point) of every string. Newlines are
   * line breaks to the TextLayer, not glyphs, and are skipped. Returns
   * {@link characters}, refreshed only if the union grew.
   */
  extend(texts: Iterable<string>): readonly string[] {
    let grew = false;
    for (const text of texts) {
      for (const character of text) {
        if (character !== "\n" && !this.#seen.has(character)) {
          this.#seen.add(character);
          grew = true;
        }
      }
    }
    if (grew) {
      this.#stable = [...this.#seen];
    }
    return this.#stable;
  }
}
