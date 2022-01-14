This is a new simulation - it's an empty scaffold to build from.

## Create agents for the simulation:

Define initial agents in init.json by adding objects to the array
Ex. `[{“position”:[0,0], “behaviors”: [‘custom.js’’}]`
OR convert init.json to a JavaScript or Python file by right clicking on init.json and return an array of agents
Agents will run each of their behaviors on each step of the simulation

## Add behaviors to the agents

Create new behavior files by clicking the new file indicator in the top left panel.
Select python or javascript.
Attach the behaviors to the agent by adding them to the agents behavior array
Ex. `[{“position”:[0,0], “behaviors”: [‘custom.js’’}]`
Behaviors can access and modify the agent state
They can allow the agent to view other agents with neighbors: Neighbors = context.neighbors()
Or allow agents to interact by sending messages state.addMessage(...)

## Run the simulation

Click the Play button or the Step Simulation button in the bottom right under the viewer
If you’ve defined a position on the agent, you’ll see the agent appear in the 3d viewer
Click reset to reset the simulation to the initial state.
