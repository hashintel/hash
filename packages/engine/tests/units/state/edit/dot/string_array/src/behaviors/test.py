def behavior(state, context):
    """Gets and sets a string array using dot notation"""
    state.s1_is_list = type(state.s1) is list
    state.s1_0_is_string = type(state.s1[0]) is str

    state.s2 = state.s1 + ["buzz"]
    state.s1.insert(0, "bazz")

    state.s2_is_list = type(state.s1) is list
    state.s2_0_is_string = type(state.s2[0]) is str
