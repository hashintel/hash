/**
 * The kinds of question Brunch can offer quick answers for, and the text an
 * answer to them becomes. Independent of the UI and of the wire format: the
 * schema, the tool description and the card all derive from it.
 */

export {
  latestOffers,
  neverOffer,
  offerBounds,
  offersAnswers,
  offerText,
  optionsFor,
  questionKinds,
  type OfferedQuestion,
  type OfferedQuestions,
} from "./question-kinds/kinds";
export {
  composeAnswers,
  coversTurn,
  fillDraft,
  type QuestionAnswer,
} from "./question-kinds/answers";
