def behavior(state, context):
    """
    Accesses each neighbor's field `value` pushing it to the relevant list.

    This ensures, that only specific agents are accessed
    """
    for neighbor in context.neighbors():
        if neighbor["agent_name"] == "a":
            state.value_a.append(neighbor["value"])
        elif neighbor["agent_name"] == "b":
            state.value_b.append(neighbor["value"])
        elif neighbor["agent_name"] == "c":
            state.value_c.append(neighbor["value"])
