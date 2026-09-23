/**
 * The identifiers the lowerings coin. Every one carries an underscore or is
 * lowercase, so none can collide with an IR name, which is UpperCamelCase.
 */

/** The Bool a transition drives: it fires this round. */
export const fireName = (transition: string): string => `fire_${transition}`;

/** The uniform draw a stochastic transition is tested against. */
export const drawName = (transition: string): string => `u_${transition}`;

/** The Bool a draw module drives: the draw passed the transition's threshold. */
export const hitName = (transition: string): string => `hit_${transition}`;

/** The external choice a controllable transition waits for. */
export const choiceName = (transition: string): string => `go_${transition}`;

/** A capped place's tokens if the step ended now. */
export const fillName = (place: string): string => `fill_${place}`;

/** A place's tokens after the transitions swept so far. */
export const availableName = (place: string): string => `avail_${place}`;

export const transitionModuleNames = (transition: string) => ({
  className: `Transition_${transition}`,
  instance: `transition_${transition}`,
});

export const placeModuleNames = (place: string) => ({
  className: `Place_${place}`,
  instance: `place_${place}`,
});

export const drawModuleNames = (transition: string) => ({
  className: `Draw_${transition}`,
  instance: `draw_${transition}`,
});

/** The whole net's module; its instance is named when it is composed with others. */
export const netModuleNames = (netName: string) => ({
  className:
    netName
      .split("_")
      .filter((part) => part !== "")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") || "Net",
  instance: "marking",
});
