def behavior(state, context):
    """Checks `state.index` to be equal to `state.behaviorIndex()`"""
    if state.behavior_index() != state.index:
        state.valid = False

    state.index += 1
