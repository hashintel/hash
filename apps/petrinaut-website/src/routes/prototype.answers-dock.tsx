/**
 * PROTOTYPE (FE-1594, throwaway; not for merge): Brunch's questions docked on
 * the composer, after Lu's wireframes of 2026-11-11, on the branch's real
 * transcript and composer over fixture turns.
 *
 *   ?scenario=<id>              a fixture turn (see the bar's picker)
 *   ?form=list|buttons          rows with label and value, or label-only buttons
 *   ?other=inline|composer      where the person's own words are typed
 *   ?select=single|multiple     one answer per question, or several
 *   ?reply=full|brief           whether the reply states the questions
 */
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import {
  PrototypeDockPage,
  type PrototypeDockSearch,
} from "../prototype-answers/prototype-dock-page";

const parseSearch = (search: Record<string, unknown>): PrototypeDockSearch => {
  const form = search.form === "buttons" ? "buttons" : "list";
  return {
    scenario: typeof search.scenario === "string" ? search.scenario : "one",
    form,
    other:
      search.other === "inline" || search.other === "composer"
        ? search.other
        : form === "list"
          ? "inline"
          : "composer",
    select: search.select === "multiple" ? "multiple" : "single",
    reply: search.reply === "brief" ? "brief" : "full",
  };
};

const PrototypeDockRoute = () => {
  const search = useSearch({ from: "/prototype/answers-dock" });
  const navigate = useNavigate({ from: "/prototype/answers-dock" });
  return (
    <PrototypeDockPage
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

export const Route = createFileRoute("/prototype/answers-dock")({
  validateSearch: parseSearch,
  component: PrototypeDockRoute,
});
