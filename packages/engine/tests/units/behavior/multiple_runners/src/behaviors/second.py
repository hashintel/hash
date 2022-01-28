def behavior(state, context):
    """Reads the value written by the first behavior and stores a modified value of it in a new field to ensure behavior composability"""
    state.b = state.a + 1
