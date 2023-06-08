def behavior(state, context):
    """Stops the simulation at step 2"""
    if context.step() == 2:
        state.messages = [{
            "to": "hash",
            "type": "stop",
            "data": {
                "status": "success",
                "reason": "test",
            }
        }]
