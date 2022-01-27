def behavior(state, context):
    """Reads value written in third behavior and stores a modified value of it to ensure behavior composability"""
    state.d = state.c + 1
