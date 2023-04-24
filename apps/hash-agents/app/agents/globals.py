from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agents.abc import Agent

# Python has no notion of private items, this hides it from the docs at least
# This needs to be in a separate files, as otherwise import will generate two globals
AGENTS: "dict[str, Agent]" = {}
