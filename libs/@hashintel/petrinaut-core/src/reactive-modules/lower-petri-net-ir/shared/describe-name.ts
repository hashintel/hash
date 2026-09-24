import { timeReference } from "./names";

/**
 * Reads the lowerings' identifiers back into words: what a variable holds
 * and which place or transition it belongs to. The prefixes are the ones
 * `names.ts` coins; an IR name carries no underscore, so a prefix and its
 * parts split without ambiguity. An attribute name is the user's own and may
 * carry underscores, so it is always the last part and takes the rest. The
 * time reference is the one coined name without a prefix: a bare lowercase
 * letter, which no IR name can be.
 */

export type NameSource = { kind: "place" | "transition"; name: string };

export type NameDescription = {
  what: string;
  why?: string;
  source?: NameSource;
};

const transition = (name: string): NameSource => ({
  kind: "transition",
  name,
});
const place = (name: string): NameSource => ({ kind: "place", name });

/** A description of a coined identifier, or `null` for a name the lowerings do not coin. */
export const describeName = (name: string): NameDescription | null => {
  if (name === timeReference) {
    return {
      what: "The time reference",
      why: "External and driven by nothing: a clock's flow is a rate against d(t), so a module that reads it awaits t.",
    };
  }
  const slot = /^([A-Z][A-Za-z0-9]*)_(\d+)_([A-Za-z_][\w]*)$/u.exec(name);
  if (slot !== null) {
    const [, placeName, index, attribute] = slot;
    return attribute === "present"
      ? {
          what: `Slot ${index} of ${placeName} holds a token`,
          why: "A coloured place is a fixed row of slots, each with a present flag and one variable per attribute.",
          source: place(placeName!),
        }
      : {
          what: `${attribute} of the token in slot ${index} of ${placeName}`,
          source: place(placeName!),
        };
  }
  const [prefix, ...parts] = name.split("_");
  const [first, second, third] = parts;
  if (parts.length === 0 || first === undefined) {
    return null;
  }
  switch (prefix) {
    case "fire":
      return {
        what: `${first} fires this step`,
        why: "The transition's module drives it; the places it touches await it.",
        source: transition(first),
      };
    case "u":
      return {
        what: `Uniform draw for ${first}, each step`,
        why: "An input the harness writes; the transition fires when the draw is at least e^(-rate·dt).",
        source: transition(first),
      };
    case "hit":
      return {
        what: `${first}'s draw passed its threshold`,
        why: "Driven by the transition's Draw module, so the places stay Int.",
        source: transition(first),
      };
    case "go":
      return {
        what: `External choice for ${first}`,
        why: "A controllable transition also waits for a controller to choose it.",
        source: transition(first),
      };
    case "pick":
      return {
        what: `The environment lets ${first} fire this step`,
        why: "An input nothing drives: any resolution of the conflict is a run, and a proof ranges over all of them.",
        source: transition(first),
      };
    case "clk":
      return {
        what: `Time left until ${first} fires`,
        why: "Armed with exp(rate) when the transition fires, run down against t while its arcs allow it; hidden in the composition.",
        source: transition(first),
      };
    case "ev":
      return {
        what: `Toggles when ${first} fires`,
        why: "An event fires by changing value; a place reads it with fired().",
        source: transition(first),
      };
    case "fires":
      return {
        what: `${first}'s clock ran out and its arcs allow it`,
        source: transition(first),
      };
    case "fired":
      return {
        what: `${first} fired this step`,
        why: "Its event differs between the latched value and the next.",
        source: transition(first),
      };
    case "fill":
      return {
        what: `${first}'s tokens if the step ended now`,
        why: "A capped place: a producer checks the room left before adding.",
        source: place(first),
      };
    case "avail":
      return {
        what: `${first}'s tokens after the transitions swept so far`,
        why: "A later transition sees what the earlier ones took.",
        source: place(first),
      };
    case "e":
      return {
        what: `Exponential draw for ${first}'s token-dependent rate`,
        why: "-ln(u) / dt, compared with the rate the tokens give.",
        source: transition(first),
      };
    case "z":
    case "v":
      return {
        what: `${prefix === "z" ? "Gaussian" : "Uniform"} draw ${second ?? ""} of ${first}'s kernel`.replace(
          "  ",
          " ",
        ),
        why: "A kernel's distribution with a constant spread becomes an input the harness draws.",
        source: transition(first),
      };
    case "ok":
      return {
        what: `${first} is structurally enabled`,
        why: "Its input places hold enough tokens, before any guard.",
        source: transition(first),
      };
    case "bind":
      return {
        what: `Combination ${second ?? ""} of ${first}'s tokens passes its guard`,
        source: transition(first),
      };
    case "sel":
      return {
        what: `Combination ${second ?? ""} is the first of ${first}'s that passes`,
        why: "Combinations are tried in the simulation's order and the first passing one fires.",
        source: transition(first),
      };
    case "seen":
      return {
        what: `Some combination of ${first} up to here passed`,
        source: transition(first),
      };
    case "take":
      return {
        what: `${first} takes the token in slot ${third ?? ""} of ${second ?? ""}`,
        source: transition(first),
      };
    case "out":
      return {
        what: `${parts.slice(3).join("_")} of token ${third ?? ""} that ${first} produces into ${second ?? ""}`,
        source: transition(first),
      };
    case "rank":
      return {
        what: `Present slots of ${first} below slot ${second ?? ""}, once the sweep is done`,
        why: "Survivors close up in slot order; a token's rank is its landing slot.",
        source: place(first),
      };
    case "kept":
      return {
        what: `Tokens ${first} keeps after the sweep`,
        source: place(first),
      };
    case "landed":
      return {
        what: `The slot the next token produced into ${first} lands in`,
        source: place(first),
      };
    case "next": {
      const source = describeName(parts.join("_"))?.source;
      return {
        what: `${parts.join("_")} once the survivors closed up`,
        ...(source === undefined ? {} : { source }),
      };
    }
    case "overflow":
      return {
        what: `A token produced into ${first} found no free slot`,
        why: "The place has more tokens than slots; raise its capacity or the slots flag.",
        source: place(first),
      };
    default:
      return null;
  }
};
