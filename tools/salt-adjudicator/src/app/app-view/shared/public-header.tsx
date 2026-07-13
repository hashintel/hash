import type { AppController } from "../../app-controller.ts";

export const PublicHeader = ({
  controller,
  active = "",
}: {
  controller: AppController;
  active?: "" | "builder" | "merge";
}) => (
  <header class="public-header">
    <button
      class="wordmark"
      type="button"
      aria-label="SALT home"
      onClick={controller.actions.openHome}
    >
      <span>SALT</span> swipe adjudicator
    </button>
    <nav aria-label="Tool modes">
      <button
        class={active === "builder" ? "is-active" : ""}
        type="button"
        onClick={controller.actions.openBuilder}
      >
        Study builder
      </button>
      <button
        class={active === "merge" ? "is-active" : ""}
        type="button"
        onClick={controller.actions.openMerge}
      >
        Merge exports
      </button>
    </nav>
  </header>
);
