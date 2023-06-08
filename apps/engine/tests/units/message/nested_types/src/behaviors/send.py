def behavior(state, context):
    """Sends a message "test" with all possible data types to '1'"""
    state.messages = [{
        "to": "1",
        "type": "test",
        "data": {
            "struct": {
                "number": 1,
                "string": "test",
                "bool": True,
                "struct": {"a": 2},
                "number_array": [1, 2, 3],
                "bool_array": [True, False, True],
                "struct_array": [
                    {"b": 3},
                    {"c": "test"}
                ],
                "fixed_number_array": [4, 5, 6],
                "fixed_bool_array": [False, True, False],
                "fixed_struct_array": [
                    {"b": 1},
                    {"c": "tested"}
                ],
            },
        },
    }]
