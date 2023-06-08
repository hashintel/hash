const behavior = (state, context) => {
  // Am I already connected?
  if (state.connected === "") {
    // Check connect messages
    const connects = context.messages().filter((m) => m.type === "connect");
    if (connects.length > 0) {
      // Choose random requesting agent
      const ind = Math.floor(Math.random() * connects.length);
      state.connected = connects[ind].from;

      // Notify connected agent
      state.addMessage(connects[ind].from, "connected");
      state.color = "purple";
    }
  }
};
