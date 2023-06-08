def behavior(state, context):
    """Gets and sets an object value using index notation"""
    state["o1_is_struct"] = type(state["o1"]) is dict
    state["o1_n1_is_number"] = type(state["o1"]["n1"]) is float

    state["o1"]["n2"] = state["o1"]["n1"] + 1
    state["o1"]["n1"] = 3

    state["o1_n2_is_number"] = type(state["o1"]["n2"]) is float
