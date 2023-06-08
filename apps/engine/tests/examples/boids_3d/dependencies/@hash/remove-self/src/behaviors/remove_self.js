/**
 * This behavior removes its agent from the simulation
 * after one time step.
 */
function behavior(state, context) {
  // Not specifying an agent_id automatically causes the
  // sender to be the target of the remove action
  state.addMessage("HASH", "remove_agent");
}
