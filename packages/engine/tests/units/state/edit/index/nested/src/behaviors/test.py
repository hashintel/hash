def behavior(state, context):
    """ Gets and sets nested values on an object using index notation"""
    state["o1_is_struct"] = type(state["o1"]) is dict

    # Boolean
    state["o1_b1_is_boolean"] = type(state["o1"]["b1"]) is bool

    state["o1"]["b2"] = state["o1"]["b1"] and True
    state["o1"]["b1"] = False

    state["o1_b2_is_boolean"] = type(state["o1"]["b2"]) is bool

    # number
    state["o1_n1_is_number"] = type(state["o1"]["n1"]) is float

    state["o1"]["n2"] = state["o1"]["n1"] + 2
    state["o1"]["n1"] = 2

    state["o1_n2_is_number"] = type(state["o1"]["n2"]) is float

    # string
    state["o1_s1_is_string"] = type(state["o1"]["s1"]) is str

    state["o1"]["s2"] = state["o1"]["s1"] + " hat"
    state["o1"]["s1"] = "beret"

    state["o1_s2_is_string"] = type(state["o1"]["s2"]) is str

    # object
    state["o1_o1_is_struct"] = type(state["o1"]["o1"]) is dict
    state["o1_o1_n1_is_number"] = type(state["o1"]["o1"]["n1"]) is float

    state["o1"]["o1"]["n2"] = state["o1"]["o1"]["n1"] + 1
    state["o1"]["o1"]["n1"] = 3

    state["o1_o1_n2_is_number"] = type(state["o1"]["o1"]["n2"]) is float

    # list
    state["o1_l1_is_list"] = type(state["o1"]["l1"]) is list
    state["o1_l1_0_is_number"] = type(state["o1"]["l1"][0]) is float

    state["o1"]["l2"] = state["o1"]["l1"] + [4]
    state["o1"]["l1"].insert(0, 0)

    state["o1_l2_is_list"] = type(state["o1"]["l2"]) is list
    state["o1_l2_0_is_number"] = type(state["o1"]["l2"][0]) is float

    # fixed size list
    state["o1_f1_is_list"] = type(state["o1"]["f1"]) is list
    state["o1_f1_0_is_number"] = type(state["o1"]["f1"][0]) is float

    state["o1"]["f2"] = [state["o1"]["f1"][0] * 5, state["o1"]["f1"][1] * 10]
    state["o1"]["f1"][0] *= 10
    state["o1"]["f1"][1] *= 20

    state["o1_f2_is_list"] = type(state["o1"]["f2"]) is list
    state["o1_f2_0_is_number"] = type(state["o1"]["f2"][0]) is float
