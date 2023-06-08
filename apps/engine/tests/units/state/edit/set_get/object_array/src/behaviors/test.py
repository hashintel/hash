def behavior(state, context):
    """Gets and sets a struct array using set/get notation"""
    state.set("o1_is_list", type(state.get("o1")) is list)
    state.set("o1_0_is_struct", type(state.get("o1")[0]) is dict)
    state.set("o1_0_n1_is_number", type(state.get("o1")[0]["n1"]) is float)

    o1 = state.get("o1")

    o1[0]["n2"] = o1[0]["n1"] + 1
    o1.append({"n3": 3.0})

    state.set("o1", o1)

    state.set("o1_0_n2_is_number", type(state.get("o1")[0]["n2"]) is float)
    state.set("o1_1_is_struct", type(state.get("o1")[0]) is dict)
    state.set("o1_1_n3_is_number", type(state.get("o1")[1]["n3"]) is float)
