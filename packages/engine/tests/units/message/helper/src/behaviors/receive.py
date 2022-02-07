def behavior(state, context):
    """Sets `state.received` if a message arrived"""
    if len(context.messages()) > 0:
        state.received = True
    else:
        state.received = False
