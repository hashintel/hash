import uuid

def generate_agent_id():
    """
    Generate a valid UUID-V4 address to create a new agent with.
    """
    return str(uuid.uuid4())
