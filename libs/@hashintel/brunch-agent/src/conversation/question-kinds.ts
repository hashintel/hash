/**
 * The kinds of question Brunch can offer quick answers for, and the text an
 * answer to them becomes. Independent of the UI and of the wire format: the
 * schema, the tool description and the dock all derive from it.
 */

export {
  mergeOffers,
  neverOffer,
  offerBounds,
  offerText,
  optionsFor,
  optionText,
  questionKinds,
  spokenQuestion,
  type OfferedOption,
  type OfferedQuestion,
  type OfferedQuestions,
} from "./question-kinds/kinds";
export {
  composeAnswers,
  pickedOption,
  pickOption,
} from "./question-kinds/answers";
