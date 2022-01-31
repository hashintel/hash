def behavior(state, context):
    """Reads the value written by the third behavior and stores a modified value of it in a new field to ensure behavior composability"""
    state.d = state.c + 1
