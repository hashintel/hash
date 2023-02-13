def behavior(state, context):
    """Gets and sets a string value using dot notation"""
    state.s1_is_string = type(state.s1) is str

    state.s2 = state.s1 + " hat"
    state.s1 = "beret"

    state.s2_is_string = type(state.s2) is str
