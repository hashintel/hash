/**
 * This behavior causes an agent to cycle through the
 * healthy, infected, immune cycle.
 */
function behavior(state, context) {
  let { sicknessDuration, recoverChance, immunityDuration, infectiousness } =
    context.globals();

  // Handle vaccine message
  const vaccine_messages = context
    .messages()
    .filter((m) => m.type === "vaccine");
  vaccine_messages.forEach((m) => {
    state.vaccine_bit = m.data.vaccine_bit;
    state.vaccine_bit_location = m.data.vaccine_bit_location;
  });

  // For SICK agents
  if (state.sick) {
    state.sick_time += 1;

    // Die or recover once the sickness runs its course
    if (state.sick_time > sicknessDuration) {
      if (Math.random() < recoverChance) {
        // Recover and gain immunity
        state.sick = false;
        state.sick_time = 0;
        state.strain = "";
        state.remaining_immunity = immunityDuration;
        state.color = "grey";

        // Remove mutation behavior
        // const ind = state.behaviors.indexOf("mutate.js");
        // state.behaviors.splice(ind, 1);
        state.fip -= 1;
        state.behaviors = [
          "virus.js",
          "@hash/random-movement/random_movement.rs",
        ];
      } else {
        // Remove myself if I die
        state.behaviors = [];
        state.dead = true;
        state.position[2] = -10;
        // state.addMessage("hash", "remove_agent");
      }
    }
    return;
  }

  // For HEALTHY and IMMUNE agents
  if (state.remaining_immunity > 0) {
    // Decrement immunity
    state.remaining_immunity--;

    if (state.remaining_immunity === 0) {
      state.color = "green";
    }
    return;
  }

  // Check for infected agents on your position
  const infectedNeighbors = context
    .neighbors()
    .filter(
      ({ position, sick }) =>
        sick && position.toString() === state.position.toString(),
    );

  // If no longer immune and infected person shares space
  if (infectedNeighbors.length > 0 && state.remaining_immunity === 0) {
    const strain = infectedNeighbors[0].strain;
    const vaccinated = strain[state.vaccine_bit_location] === state.vaccine_bit;

    // If vaccination won't protect you from this strain,
    // become infected with some probability.
    if (!vaccinated & (Math.random() < infectiousness)) {
      state.sick = true;
      state.was_sick = true;
      // state.behaviors.unshift("mutate.js");
      state.behaviors = [
        "mutate.js",
        "virus.js",
        "@hash/random-movement/random_movement.rs",
      ];
      state.fip += 1;
      state.strain = strain;
      state.color = "red";
    }
  }

  if (state.strain[0] === "1") {
    state.height = 2;
  }
}
