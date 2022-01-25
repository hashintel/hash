def behavior(state, context):
    """Reading non-existing field `non_existing_field`"""
    state.set("field_to_be_set", state.get("non_existing_field"))
