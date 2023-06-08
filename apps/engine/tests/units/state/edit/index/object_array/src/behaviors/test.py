def behavior(state, context):
    """Gets and sets a struct array using index notation"""
    state["o1_is_list"] = type(state["o1"]) is list
    state["o1_0_is_struct"] = type(state["o1"][0]) is dict
    state["o1_0_n1_is_number"] = type(state["o1"][0]["n1"]) is float

    state["o1"][0]["n2"] = state["o1"][0]["n1"] + 1
    state["o1"].append({"n3": 3.0})

    state["o1_0_n2_is_number"] = type(state["o1"][0]["n2"]) is float
    state["o1_1_is_struct"] = type(state["o1"][0]) is dict
    state["o1_1_n3_is_number"] = type(state["o1"][1]["n3"]) is float
