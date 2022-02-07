def behavior(state, context):
    """Sends an empty message "test" to '1'"""
    state.messages = [{
        "to": ["1"],
        "type": "test",
        "data": {}
    }]
