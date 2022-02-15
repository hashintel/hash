def behavior(state, context):
    """Reads messages and stores them into the agent's state"""
    messages = context.messages()

    if len(messages) > 0:
        data = messages[0]["data"]

        state.number = data["struct"]["number"]
        state.string = data["struct"]["string"]
        state.bool = data["struct"]["bool"]
        state.struct = data["struct"]["struct"]
        state.number_array = data["struct"]["number_array"]
        state.bool_array = data["struct"]["bool_array"]
        state.struct_array = data["struct"]["struct_array"]
        state.fixed_number_array = data["struct"]["fixed_number_array"]
        state.fixed_bool_array = data["struct"]["fixed_bool_array"]
        state.fixed_struct_array = data["struct"]["fixed_struct_array"]
