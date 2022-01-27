def behavior(state, context):
    """Reads value written in first behavior and stores a modified value of it to ensure behavior composability"""
    state.b = state.a + 1
