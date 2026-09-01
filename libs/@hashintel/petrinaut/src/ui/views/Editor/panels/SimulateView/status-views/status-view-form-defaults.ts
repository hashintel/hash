import type { StatusViewFormState } from "./status-view-form";

export const defaultStatusLabelColor = "#3b82f6";

/**
 * Empty defaults for a new status view form: one place-bound label to start
 * from, since a view with no labels assigns nothing.
 */
export const makeEmptyStatusViewFormState = (): StatusViewFormState => ({
  name: "",
  description: "",
  identityRef: "",
  labels: [
    {
      id: crypto.randomUUID(),
      name: "",
      displayColor: defaultStatusLabelColor,
      places: [],
      tokenCondition: "",
      isExit: false,
    },
  ],
});
