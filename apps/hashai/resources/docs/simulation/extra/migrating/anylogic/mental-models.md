---
title: Mental Models
slug: simulation/extra/migrating/anylogic/mental-models
objectId: 89895f63-effb-4a53-b543-653d9e5637e3
---

# Mental Models

Mental models are conceptual frameworks, or ways of thinking, that can be applied to help solve problems.

Having built thousands of simulations from scratch, and converted many more originally written for Excel and other tools, or custom-coded, we've distilled down a number of the key elements here.

## Planning the Build

### 1. Start by cataloguing and reviewing all the agents in the simulation

Use a simple format for listing the agents and their behaviors, for instance:

\[Agent Name\]

- Purpose: why is the agent in the simulation?
- Properties \(values stored on the agent\)
- Behaviors \(actions an agent can take\) which are equivalent to the Functions, State Charts, and sub-agents stored in the agent
- Interactions \(what other agents does this agent interact with\)
- Edge cases: Are there any unique or difficult interactions that you’ll need to handle?

If the model is not an agent based model, identify the key processes that should be represented as an agent, and repeat the step above with each process.

### 2. Understand the main loop

The main loop is a broad concept meant to capture the general process of the simulation. While sophisticated simulations can and do evolve over time, there is always a process or set of processes that direct the agent interactions.

- What is the high level process you’re representing in the simulation?
- From start to finish, what is a single run of a simulation?

<Hint style="info">
Consider creating a flowchart to represent at a high level what is happening in a simulation
</Hint>

- Are there “globals” \(environment variables\)? What are they?
- What is the timescale of the simulation? Does each agent execute on every timestep, or are there delays?
- Are the agents self directed or do you need a manager agent that triggers certain agents. An agent like this might perform functions that are contained within the AnyLogic model’s Main agent.

### Executing the build

1.  Start from the ‘outside’ of a model and move ‘inwards’. By that we mean you can think of your simulation as almost a graph or tree structure. Certain agents are more ‘central’ to the simulation logic, while other agents are independent and are on the ‘edges’ of a model. We recommend starting with the external agents, the ones that rely the least on other agents, and moving inwards.
1.  After adding an agent or a significant piece of functionality, test it. Run the simulation and assess if it’s working as expected.
    - Start a sim with the smallest number of agents you can, and step through the sim to see if the process is working as expected.
1.  Once the core logic is working, define the initialization process of the full agent population
    - What will populate the values of an agent? Database entries, hardcoded values, random distributions?
    - What connections between agents need to be set?

### Finalizing the build

1.  Once the agents are present and the logic is working as expected you can layer on visualizations.
1.  Create analysis charts that communicate the key metrics.
1.  Test with the target population size of agents
