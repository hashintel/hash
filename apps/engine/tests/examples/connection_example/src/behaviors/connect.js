const behavior = (state, context) => {
  if (state.connected === "") {
    // Ask a nearby tall agent to connect
    const potential_connections = context
      .neighbors()
      .filter((n) => n.height === 2);
    if (potential_connections.length > 0) {
      const ind = Math.floor(Math.random() * potential_connections.length);

      state.addMessage(potential_connections[ind].agent_id, "connect");
    }
  }

  // Check for any confirmed connections
  const connected = context.messages().filter((m) => m.type === "connected");
  if (connected.length > 0) {
    state.color = "purple";
    state.connected = connected[0].from;
  }
};
