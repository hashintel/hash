def behavior(state, context):
    """Sets `state.valid = False` if `context.step()` returns wrong value"""
    state.step += 1

    if state.step != context.step():
        state.valid = False
