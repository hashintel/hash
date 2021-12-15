---
title: Agent
slug: simulation/creating-simulations/libraries/hash/agent
objectId: 34c98a57-c201-48ef-bb76-5abcd714fea9
---

# Agent

## generateAgentID()

Function that returns a valid UUID address that can be set as the agent ID. In particular it's useful for adding a unique identifier to an agent that will then be used to message that agent.

```javascript
function behavior(state, context) {
    let agent = {
        "position": [0,0]
    }

    // Creates a valid UUID-V4 address for a HASH agent
    let agent_id = hstd.generateAgentID();
    agent.agent_id = agent_id;
    state.addMessage("hash", "create_agent", agent)

    let parent_agent = {
        "children" = []
    }

    //The parent agent will hold a list of 'children' that it
    // can send messages to in a simulation
    parent_agent.children.push(agent_id)
    state.addMessage("hash", "create_agent", parent_agent)
}
```
