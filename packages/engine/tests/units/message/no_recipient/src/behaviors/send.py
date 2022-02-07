def behavior(state, context):
    """Sends an empty message "test" to no-one"""
    state.messages = [{
        "to": [],
        "type": "test",
        "data": {}
    }]
