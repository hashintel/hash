/**
 * This behavior updates the defined agents by making
 * an initial number begin as "sick" agents.
 */
function behavior(state, context) {
  const { infectedCount } = context.globals();

  let infected_total = 0;
  // Modify the people agents
  state.agents["people"].forEach((p) => {
    // Check if more initial infected are needed
    const sick = infected_total < infectedCount;
    infected_total = sick ? infected_total + 1 : infected_total;

    p.sick = sick;
    p.strain = sick ? "00" : "";
    p.color = sick ? "red" : "green";
    p.was_sick = sick ? true : false;

    // if (sick) { p.behaviors.unshift("mutate.js"); }
    if (sick) {
      p.behaviors = [
        "mutate.js",
        "virus.js",
        "@hash/random-movement/random_movement.rs",
      ];
    }
  });
}
