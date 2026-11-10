/**
 * PROTOTYPE (FE-1594 review, throwaway; not for merge): the branch's real
 * quick-answer card, transcript and composer over fixture turns, for deciding
 * the open design questions from the branch review.
 *
 *   ?scenario=<id>                 a fixture turn (see the bar's picker)
 *   ?variant=built|merged|last     how several offers in one turn are shown
 *   ?keepDraft=true|false          whether a click that sends keeps typed text
 *   ?freeText=card|composer        where "Something else…" is typed
 */
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import {
  PrototypeAnswersPage,
  type PrototypeAnswersSearch,
} from "../prototype-answers/prototype-answers-page";

const parseSearch = (
  search: Record<string, unknown>,
): PrototypeAnswersSearch => ({
  scenario: typeof search.scenario === "string" ? search.scenario : "single",
  variant:
    search.variant === "built" || search.variant === "last"
      ? search.variant
      : "merged",
  keepDraft: !(search.keepDraft === false || search.keepDraft === "false"),
  freeText: search.freeText === "card" ? "card" : "composer",
});

const PrototypeAnswersRoute = () => {
  const search = useSearch({ from: "/prototype/answers" });
  const navigate = useNavigate({ from: "/prototype/answers" });
  return (
    <PrototypeAnswersPage
      search={search}
      onSearchChange={(patch) => {
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: true,
        });
      }}
    />
  );
};

export const Route = createFileRoute("/prototype/answers")({
  validateSearch: parseSearch,
  component: PrototypeAnswersRoute,
});
