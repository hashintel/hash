def behavior(state, context):
    """
    Regression test with at least three agents, where one agent has a fixed-size list as field, but one agent before and
    one agent after does not have this field.

    Empty behavior (we need a behavior to execute)
    """
    state.list_is_null = state.list is None
