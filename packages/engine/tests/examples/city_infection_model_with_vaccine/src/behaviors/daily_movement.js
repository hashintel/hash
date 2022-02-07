/**
 * This behavior causes a person agent to go to and from the
 * home to various destinations and practice social distancing.
 */
function behavior(state, context) {
  const { destinations, leave_chance } = context.globals();

  const social_distancing = state.get("social_distancing");
  const icu = state.get("icu");

  let out = state.get("out");
  let destination = state.get("destination");
  let direction = state.get("direction");
  let position = state.get("position");
  let behaviors = state.get("behaviors");

  /**
   * This function returns the distance between the agent's
   * position and destination.
   */
  function get_distance() {
    const destination = state.get("destination");
    const position = state.get("position");

    const dx = destination[0] - position[0];
    const dy = destination[1] - position[1];

    return (dx ** 2 + dy ** 2) ** 0.5;
  }

  /**
   * This function returns a scaled direction vector
   * between the agent's position and destination.
   */
  function get_direction() {
    const destination = state.get("destination");
    const position = state.get("position");

    const dx = destination[0] - position[0];
    const dy = destination[1] - position[1];

    // Agents will take one or two steps to reach destination
    const step = Math.random() < 0.5 ? 1 : 2;
    return [dx / step, dy / step];
  }

  if (out) {
    if (social_distancing) {
      // Go home or to the hospital to social distance
      if (icu) {
        destination = state.get("hospital");
      } else {
        destination = state.get("home");
      }
    }

    // If I'm close enough to my destination
    if (get_distance() <= 3) {
      // Move me to it and change my behavior
      position = destination;
      direction = null;
      out = false;
      behaviors = [
        "receive_vaccine.js",
        "infection.js",
        "daily_movement.js",
        "check_infected.js",
      ];
    } else {
      direction = get_direction();
    }
  } else {
    // If in the ICU or social distancing indoors, don't move
    if (social_distancing || icu) {
      return;
    } else if (Math.random() < leave_chance) {
      // Otherwise leave w/ some probability to a new destination
      const ind = Math.floor(Math.random() * destinations.length);
      destination = state.get(destinations[ind]);
      out = true;

      if (!state.get("deceased")) {
        behaviors.push("@hash/move-in-direction/move_in_direction.rs");
      }
    }
  }

  state.set("out", out);
  state.set("destination", destination);
  state.set("direction", direction);
  state.set("position", position);
  state.set("behaviors", behaviors);
}
