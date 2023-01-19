/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */

//For each center, assign calls to operators within each one
//If there are too many calls, use links to reroute calls
//If there are still more calls remaining, balk calls
const behavior = (state, context) => {
  //Only assign calls when the state countdown has reached zero
  if (state.counter !== 0) {
    return;
  }
  const max_queue_size = context.globals().max_queue_size;

  //Start by removing calls from the queue and routing to internal operators
  while (
    state.call_queue.length !== 0 &&
    state.current_calls.length !== state.operators
  ) {
    const call = state.call_queue.shift();
    state.current_calls.push(call);
  }

  // Send out external calls (if queue is full)
  if (state.call_queue.length > max_queue_size) {
    let available_links = context
      .neighbors()
      .filter((l) => l.available && state.links.includes(l.agent_id));
    let sent = 0;
    let l_index = 0;

    //Reroute the extra calls through links
    while (
      state.call_queue.length > max_queue_size &&
      l_index < available_links.length
    ) {
      const call = state.call_queue.pop();
      let link = available_links[l_index];

      //Use links to send rerout call to a neighbouring agents
      state.addMessage(link.agent_id, "external_call", call);

      sent++;
      const link_available = sent + link.sent < link.capacity ? true : false;

      if (!link_available) {
        l_index++;
      }
    }

    // Update balked calls (if no operators or links available and queue is full)
    if (state.call_queue.length > max_queue_size) {
      const balked = state.call_queue.splice(
        max_queue_size,
        state.call_queue.length - max_queue_size,
      );
      const external = balked.filter((c) => c.origin !== state.agent_id);
      external.forEach((c) => {
        state.addMessage(c.link_return, "balked_call");
        state.addMessage(c.origin, "balked_call");
      });
      state.nBalked += balked.length - external.length;
    }
  }

  // Update variables
  state.height = state.current_calls.length;
};
