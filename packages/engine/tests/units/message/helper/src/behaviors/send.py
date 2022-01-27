def behavior(state, context):
    """Sends an empty message "test" to '1'"""
    state.add_message("1", "test", {})
