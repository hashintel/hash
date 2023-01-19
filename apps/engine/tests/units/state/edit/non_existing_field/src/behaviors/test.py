def behavior(state, context):
    """Reading a non-existing field to ensure the return type is `None`"""
    state.set("field_to_be_set", state.get("non_existing_field"))
