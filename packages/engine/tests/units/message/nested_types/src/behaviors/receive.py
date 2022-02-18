def behavior(state, context):
    """Reads messages and stores them into the agent's state"""
    messages = context.messages()

    if len(messages) > 0:
        data = messages[0]["data"]

        state.struct = data["struct"]
