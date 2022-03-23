def behavior(state, context):
    """ Gets and sets nested values on an object using index notation"""
    o1 = state.get("o1")

    state.set("o1_is_struct", type(o1) is dict)

    # Boolean
    state.set("o1_b1_is_boolean", type(o1["b1"]) is bool)

    o1["b2"] = o1["b1"] and True
    o1["b1"] = False

    state.set("o1_b2_is_boolean", type(o1["b2"]) is bool)

    # number
    state.set("o1_n1_is_number", type(o1["n1"]) is float)

    o1["n2"] = o1["n1"] + 2
    o1["n1"] = 2

    state.set("o1_n2_is_number", type(o1["n2"]) is float)

    # string
    state.set("o1_s1_is_string", type(o1["s1"]) is str)

    o1["s2"] = o1["s1"] + " hat"
    o1["s1"] = "beret"

    state.set("o1_s2_is_string", type(o1["s2"]) is str)

    # object
    state.set("o1_o1_is_struct", type(o1["o1"]) is dict)
    state.set("o1_o1_n1_is_number", type(o1["o1"]["n1"]) is float)

    o1["o1"]["n2"] = o1["o1"]["n1"] + 1
    o1["o1"]["n1"] = 3

    state.set("o1_o1_n2_is_number", type(o1["o1"]["n2"]) is float)

    # list
    state.set("o1_l1_is_list", type(o1["l1"]) is list)
    state.set("o1_l1_0_is_number", type(o1["l1"][0]) is float)

    o1["l2"] = o1["l1"] + [4]
    o1["l1"].insert(0, 0)

    state.set("o1_l2_is_list", type(o1["l2"]) is list)
    state.set("o1_l2_0_is_number", type(o1["l2"][0]) is float)

    # fixed size list
    state.set("o1_f1_is_list", type(o1["f1"]) is list)
    state.set("o1_f1_0_is_number", type(o1["f1"][0]) is float)

    o1["f2"] = [o1["f1"][0] * 5, o1["f1"][1] * 10]
    o1["f1"][0] *= 10
    o1["f1"][1] *= 20

    state.set("o1_f2_is_list", type(o1["f2"]) is list)
    state.set("o1_f2_0_is_number", type(o1["f2"][0]) is float)

    state.set("o1", o1)
