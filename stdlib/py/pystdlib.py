#############################################################################
# This file needs to be manually copied into pystdlib.ts
#############################################################################


def incr(n):
    """
    Increments a string
    """
    return n + 1


def generateAgentID(asStr=True):
    """
    Generates a uuid-v4 address valid for agent generation
    """
    import uuid
    if asStr:
        return str(uuid.uuid4())
    else:
        return uuid.uuid4()
