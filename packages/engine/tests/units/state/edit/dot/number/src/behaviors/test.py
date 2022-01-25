def behavior(state, context):
    """Gets and sets a number value using dot notation"""
    state.n1_is_number = type(state.n1) is float

    state.n2 = state.n1 + 2
    state.n1 = 2

    state.n2_is_number = type(state.n2) is float
