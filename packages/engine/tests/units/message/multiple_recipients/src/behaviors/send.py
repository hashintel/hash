def behavior(state, context):
    """Sends an empty message "test" to '1' and '2'"""
    state.messages = [{
        "to": ["1", "2"],
        "type": "test",
        "data": {}
    }]
