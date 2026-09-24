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

/** A slot of a coloured place holds a token. */
export const presentName = (place: string, slot: number): string =>
  `${place}_${slot}_present`;

/** One attribute of the token in a slot. */
export const attributeName = (
  place: string,
  slot: number,
  attribute: string,
): string => `${place}_${slot}_${attribute}`;

/** The exponential draw a token-dependent rate is tested against: `-ln(u) / dt`. */
export const exponentialDrawName = (transition: string): string =>
  `e_${transition}`;

/** The k-th standard-normal or uniform draw a kernel takes. */
export const kernelDrawName = (
  transition: string,
  kind: "z" | "v",
  index: number,
): string => `${kind}_${transition}_${index}`;

/** A transition's structural enablement, shared by its binding combinations. */
export const enabledName = (transition: string): string => `ok_${transition}`;

/** Combination `index` of a transition's bindings passes. */
export const bindName = (transition: string, index: number): string =>
  `bind_${transition}_${index}`;

/** Combination `index` is the first that passes. */
export const selectName = (transition: string, index: number): string =>
  `sel_${transition}_${index}`;

/** Some combination up to here passed. */
export const seenName = (transition: string): string => `seen_${transition}`;

/** The transition takes the token in a slot. */
export const takeName = (
  transition: string,
  place: string,
  slot: number,
): string => `take_${transition}_${place}_${slot}`;

/** An attribute of the m-th token a transition produces into a place. */
export const outName = (
  transition: string,
  place: string,
  index: number,
  attribute: string,
): string => `out_${transition}_${place}_${index}_${attribute}`;

/** Present slots below a slot, once the sweep is done. */
export const rankName = (place: string, slot: number): string =>
  `rank_${place}_${slot}`;

/** Tokens a place keeps after the sweep. */
export const keptName = (place: string): string => `kept_${place}`;

/** The slot the next produced token lands in. */
export const landedName = (place: string): string => `landed_${place}`;

/** An attribute's value once the survivors have closed up. */
export const nextName = (variable: string): string => `next_${variable}`;

/** A produced token found no free slot, at some step. */
export const overflowName = (place: string): string => `overflow_${place}`;

/** The clock a transition owns under the clocks strategy: the time left until it fires. */
export const clockName = (transition: string): string => `clk_${transition}`;

/** The event a transition toggles when it fires. */
export const eventName = (transition: string): string => `ev_${transition}`;

/** A transition module's local: its clock ran out and its arcs allow it. */
export const firesName = (transition: string): string => `fires_${transition}`;

/** A place module's local: the transition's event toggled this step. */
export const firedName = (transition: string): string => `fired_${transition}`;

/** The external time reference every clock runs down against. */
export const timeReference = "t";
