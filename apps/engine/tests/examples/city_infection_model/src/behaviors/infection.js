/**
 * This behavior handles transitioning between healthy, exposed,
 * infected, immune and deceased states. It also calculates the R0 value.
 */
function behavior(state, context) {
  const {
    infection_rate,
    contraction_rate,
    duration_range,
    duration_min,
    infection_radius,
    immunity_proportion,
    chance_of_severe,
    at_risk_chance_of_severe,
    severe_mortality_rate,
    at_risk,
  } = context.globals();

  /** This function calcualtes your distance to another agent. */
  function distance(agent) {
    const dx = agent.position[0] - state.position[0];
    const dy = agent.position[1] - state.position[1];

    return (dx ** 2 + dy ** 2) ** 0.5;
  }

  // Keep track of how many people I infected last turn for calculating R0
  const infected_msg = context.messages().filter((m) => m.type == "got_me");
  if (infected_msg.length) {
    let ni = state.num_infected;
    ni = ni ? ni : 0;
    state.num_infected = ni + infected_msg.length;
  }

  // No infection occurs if I am immune
  if (state.health_status === "immune") {
    return;
  }

  // Clear agent properties if deceased
  if (state.health_status === "deceased") {
    state.position = null;
    state.behaviors = [];
    return;
  }

  if (state.health_status === "healthy") {
    // Count infected neighbors
    const infected_neighbors = context
      .neighbors()
      .filter((n) => n.health_status === "infected")
      .filter((n) => n.out === state.out)
      .filter((n) => distance(n) <= infection_radius);

    // Check if you were exposed
    infected_neighbors.forEach((n) => {
      if (Math.random() < infection_rate) {
        state.health_status = "exposed";
        state.color = "purple";
        state.exposer = n.agent_id;
        return;
      }
    });
  } else if (state.health_status === "exposed") {
    // Contract the virus with some likelihood
    if (Math.random() < contraction_rate) {
      state.health_status = "infected";
      state.color = "red";
      state.was_sick = true;
      state.num_infected = 0;
      state.infection_duration =
        Math.floor(Math.random() * duration_range) + duration_min;
      state.infection_counter = 0;

      if (state.exposer) {
        // Notify the agent who exposed you for R0 purposes
        state.addMessage(state.exposer, "got_me", {});
      }
    }
  } else {
    // If this agent is infected...
    // Reduce the time left to be infected
    state.infection_duration -= 1;
    state.infection_counter += 1;

    // If agent has a severe infection there's a chance they die
    if (state.severity === "severe" && Math.random() < severe_mortality_rate) {
      state.health_status = "deceased";
      state.deceased = true;
      state.behaviors = ["infection.js"];

      // Notify the ICU
      if (state.icu) {
        state.addMessage("Hospital", "died", {});
        state.icu = false;
      }
      return;
    }

    // Check if the infection becomes severe
    const severe_chance = at_risk ? at_risk_chance_of_severe : chance_of_severe;
    if (state.severity === "moderate" && Math.random() < severe_chance) {
      state.severity = "severe";
    }

    // Once infection_duration reached, set as immune or healthy
    if (state.infection_duration === 0) {
      state.health_status =
        Math.random() < immunity_proportion ? "immune" : "healthy";
      state.color = "green";

      // Notify the hospital the person has recovered
      if (state.icu) {
        state.addMessage("Hospital", "recovered", { msg: "All Better!" });
        state.icu = false;
        state.destination = state.home;
        state.out = true;
      }
    }
  }
}
