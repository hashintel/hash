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

  let health_status = state.get("health_status");
  let position = state.get("position");
  let deceased = state.get("deceased");
  let color = state.get("color");
  let was_sick = state.get("was_sick");
  let infection_duration = state.get("infection_duration");
  let infection_counter = state.get("infection_counter");
  let behaviors = state.get("behaviors");
  let severity = state.get("severity");
  let out = state.get("out");
  let icu = state.get("icu");
  let destination = state.get("destination");

  /** This function performs all needed set functions. */
  function set_state() {
    state.set("health_status", health_status);
    state.set("behaviors", behaviors);
    state.set("position", position);
    state.set("deceased", deceased);
    state.set("color", color);
    state.set("was_sick", was_sick);
    state.set("infection_duration", infection_duration);
    state.set("infection_counter", infection_counter);
    state.set("severity", severity);
    state.set("out", out);
    state.set("icu", icu);
    state.set("destination", destination);
  }

  /** This function calcualtes your distance to another agent. */
  function distance(agent) {
    let position = state.get("position");
    const dx = agent.position[0] - position[0];
    const dy = agent.position[1] - position[1];

    return (dx ** 2 + dy ** 2) ** 0.5;
  }

  // Keep track of how many people I infected last turn for calculating R0
  const num_infected = context.messages().filter((m) => m.type == "got_me");
  if (num_infected.length) {
    let ni = state.get("num_infected");
    ni = ni ? ni : 0;
    state.set("num_infected", ni + num_infected.length);
  }

  // No infection occurs if I am immune
  if (health_status === "immune") {
    return;
  }

  // Clear agent properties if deceased
  if (health_status === "deceased") {
    state.set("position", null);
    state.set("behaviors", []);
    return;
  }

  if (health_status === "healthy") {
    // Count infected neighbors
    const infected_neighbors = context
      .neighbors()
      .filter((n) => n.health_status === "infected")
      .filter((n) => n.out === out)
      .filter((n) => distance(n) <= infection_radius);

    // Check if you were exposed
    infected_neighbors.forEach((n) => {
      if (Math.random() < infection_rate) {
        health_status = "exposed";
        color = "purple";
        set_state();
        state.set("exposer", n.agent_id);
        return;
      }
    });
  } else if (health_status === "exposed") {
    // Contract the virus with some likelihood
    if (Math.random() < contraction_rate) {
      health_status = "infected";
      color = "red";
      was_sick = true;
      state.set("num_infected", 0);
      infection_duration =
        Math.floor(Math.random() * duration_range) + duration_min;
      infection_counter = 0;

      if (state.get("exposer")) {
        // Notify the agent who exposed you for R0 purposes
        state.addMessage(state.get("exposer"), "got_me", {});
      }
    }
  } else {
    // If this agent is infected...
    // Reduce the time left to be infected
    infection_duration -= 1;
    infection_counter += 1;

    // If agent has a severe infection there's a chance they die
    if (severity === "severe" && Math.random() < severe_mortality_rate) {
      health_status = "deceased";
      deceased = true;
      behaviors = ["infection.js"];

      // Notify the ICU
      if (icu) {
        state.addMessage("Hospital", "died", {});
        icu = false;
      }
      set_state();
      return;
    }

    // Check if the infection becomes severe
    const severe_chance = at_risk ? at_risk_chance_of_severe : chance_of_severe;
    if (severity === "moderate" && Math.random() < severe_chance) {
      severity = "severe";
    }

    // Once infection_duration reached, set as immune or healthy
    if (infection_duration === 0) {
      health_status =
        Math.random() < immunity_proportion ? "immune" : "healthy";
      color = "green";

      // Notify the hospital the person has recovered
      if (icu) {
        state.addMessage("Hospital", "recovered", { msg: "All Better!" });
        icu = false;
        destination = state.get("home");
        out = true;
      }
    }
  }

  set_state();
}
