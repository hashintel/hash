def behavior(state, context):
    """Gets and sets a number fixed-size-array using dot notation"""
    state.s1_is_list = type(state.s1) is list
    state.s1_0_is_string = type(state.s1[0]) is str
    state.s1_1_is_string = type(state.s1[1]) is str

    state.s2 = [state.s1[0] + "bar", state.s1[1] + "foo"]
    state.s1[0] += "boo"
    state.s1[1] += "far"

    state.s2_is_list = type(state.s2) is list
    state.s2_0_is_string = type(state.s2[0]) is str
    state.s2_1_is_string = type(state.s2[1]) is str
