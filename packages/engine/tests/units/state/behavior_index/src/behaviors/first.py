def behavior(state, context):
    """Validates that `state.index` is equal to `state.behaviorIndex()`"""
    if state.behavior_index() != state.index:
        state.valid = False

    state.index += 1
