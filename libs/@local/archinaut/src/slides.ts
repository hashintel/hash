/**
 * Decks beside the docs. A folder per deck under the instance's slides
 * directory, each with a `deck.json` and numbered slides, `<n>-<name>.tsx`
 * or `.mdx`, shown in file order. Decks are not part of the bundle: the site
 * reads the folder where it is, so it may be committed, git-ignored, or
 * outside the repository.
 */

export { listDecks, slidesRoot, type DeckFolder } from "./slides/folders";
export { scaffoldDeck } from "./slides/scaffold";
export { exportDeckPdfs } from "./slides/pdf";
export { typecheckDecks } from "./slides/typecheck";
