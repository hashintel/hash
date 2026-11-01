import coffeeCounter from "./coffee-counter.petrinaut?raw";
import epidemic from "./epidemic.petrinaut?raw";
import thermostat from "./thermostat.petrinaut?raw";
import workshop from "./workshop.petrinaut?raw";

/** A net written in the DSL, for a host that lets a reader start from one. */
export type DslExample = {
  id: string;
  title: string;
  /** One sentence: the model, and what the text shows of the language. */
  description: string;
  text: string;
};

/**
 * Nets written in the DSL by hand, in reading order: each shows a part of
 * the language the one before did not, and each parses, merges, compiles
 * and checks clean.
 */
export const dslExamples: readonly DslExample[] = [
  {
    id: "coffee-counter",
    title: "Coffee counter",
    description:
      "A queue with two baristas: places, rates, a metric and a scenario with a marking.",
    text: coffeeCounter,
  },
  {
    id: "epidemic",
    title: "Epidemic",
    description:
      "SIR over people with an age: a token type, kernels, metrics over token data and an initial state written as code.",
    text: epidemic,
  },
  {
    id: "workshop",
    title: "Workshop",
    description:
      "A supplier and three cells composed by place fusion: components, ports, instances with bindings and fusions.",
    text: workshop,
  },
  {
    id: "thermostat",
    title: "Thermostat",
    description:
      "A heated room: dynamics on a continuous attribute, guards, read and inhibitor arcs.",
    text: thermostat,
  },
];
