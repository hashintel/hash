/**
 * This behavior causes a person agent to go to and from the
 * home to various destinations and practice social distancing.
 */
function behavior(state, context) {
  const { destinations, leave_chance } = context.globals();

  /**
   * This function returns the distance between the agent's
   * position and destination.
   */
  function get_distance() {
    const dx = state.destination[0] - state.position[0];
    const dy = state.destination[1] - state.position[1];

    return (dx ** 2 + dy ** 2) ** 0.5;
  }

  /**
   * This function returns a scaled direction vector
   * between the agent's position and destination.
   */
  function get_direction() {
    const dx = state.destination[0] - state.position[0];
    const dy = state.destination[1] - state.position[1];

    // Agents will take one or two steps to reach destination
    const step = Math.random() < 0.5 ? 1 : 2;
    return [dx / step, dy / step];
  }

  if (state.out) {
    if (state.social_distancing) {
      // Go home or to the hospital to social distance
      if (state.icu) {
        state.destination = state.hospital;
      } else {
        state.destination = state.home;
      }
    }

    // If I'm close enough to my destination
    if (get_distance() <= 3) {
      // Move me to it and change my behavior
      state.position = state.destination;
      state.direction = null;
      state.out = false;
      state.behaviors = [
        "infection.js",
        "daily_movement.js",
        "check_infected.js",
      ];
    } else {
      state.direction = get_direction();
    }
  } else {
    // If in the ICU or social distancing indoors, don't move
    if (state.social_distancing || state.icu) {
      return state;
    } else if (Math.random() < leave_chance) {
      // Otherwise leave w/ some probability to a new destination
      const ind = Math.floor(Math.random() * destinations.length);
      state.destination = state[destinations[ind]];
      state.out = true;

      if (!state.deceased) {
        state.behaviors.push("@hash/move-in-direction/move_in_direction.rs");
      }
    }
  }
}
