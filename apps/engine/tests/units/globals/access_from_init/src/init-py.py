def init(context):
    """Initialize state from globals"""
    return [{
        "behaviors": ["test.py"],
        "a": context.globals()["a"]
    }]
