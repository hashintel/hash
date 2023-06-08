def behavior(state, context):
    """Gets and sets a number array using dot notation"""
    state.n1_is_list = type(state.n1) is list
    state.n1_0_is_number = type(state.n1[0]) is float

    state.n2 = state.n1 + [4]
    state.n1.insert(0, 0)

    state.n2_is_list = type(state.n1) is list
    state.n2_0_is_number = type(state.n2[0]) is float
