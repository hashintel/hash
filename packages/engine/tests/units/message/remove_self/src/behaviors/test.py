def behavior(state, context):
    """Remove this agent from the simulation"""
    state.messages = [{
        "to": "hash",
        "type": "remove_agent"
    }]
