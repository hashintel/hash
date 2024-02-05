---
title: "Reinforcement Learning in HASH Simulations"
date: "2021-07-14"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/73337fed-6b7d-4857-e76c-c2ba4da5d700/public
categories: 
  - "Simulation"
  - "AI"
---

_[Q-Learning Map Explorer](https://hash.ai/@hash/q-learning-map-explorer)_

Reinforcement Learning (RL) is a way to teach an agent how to behave in an environment by rewarding it when it does well and penalizing it when it does poorly. Using RL in HASH, you can create complex agents that figure out 'on their own' optimal strategies to follow in a simulation. These strategies (or **policies**) can then be applied to real world situations.

Reinforcement learning has the potential to transform how we build and use simulations. HASH as a platform is designed to help you leverage advances in the field of ML/RL and apply them directly within your simulations.

We've created a demonstration in HASH using a simple reinforcement learning algorithm called Q-Learning that agents can use to navigate a two-dimensional environment, avoid obstacles, and get to an end goal. You can follow along in our example simulation (linked and below), or use the [Q-Learning behavior library](https://hash.ai/@hash/qrl) we've published to experiment with it in your own RL simulations.

<iframe style="position: absolute; top: 0; left: 0;" src="https://core.hash.ai/embed.html?project=%40hash%2Fq-learning-map-explorer&amp;ref=stable&amp;tabs=3d%2Canalysis" width="100%" height="100%" frameborder="0" scrolling="auto"></iframe>

* * *

The basic structure of a reinforcement learning simulation is an **agent** decides what **actions** to take in a given time step in its **environment**; it executes the action, updating the **state** of the agent and its surrounding, and receives a **reward** which can then **update** the **policy** the agent uses to select actions.

![](images/rl-loop.png)

From "Reinforcement Learning: An Introduction, Sutton and Barto,   
MIT Press, Cambridge, MA, 2018

This loop continues until the agent either reaches the goal, hits an obstacle, or until a set number of time steps have passed; once either condition is met the simulation resets and repeats. However the policy the agent is using will be preserved, and updated every episode. After many runs (or episodes) the agent’s policy should converge to an optimal set of actions that are best suited for maximizing its reward.

Let's break down the different parts of the simulation and see how they fit into this RL framework.

#### **Environment**

Gridworld: The 2D environment we'll create for the agent to operate in is called 'gridworld'. This is a common testing and demo environment for experimenting with reinforcement learning algorithms. It's a two dimensional space populated with blocks that represent obstacles or goals. If the agent lands on an obstacle, it's penalized. If it gets to the goal state, the agent is rewarded.

The parameters for the environment are defined in **globals.json** in the gridworld object. In the initialization file, **init.py,** the environment is created from these parameters.

![](images/image32.png)

Our agent (the green 3D block), sitting in patient contemplation at simulation initialization, surveying the red obstacles and blue goal state.

#### **Agent**

The agent is initialized with a set of behaviors:

\[“validate\_action.py”, "action.py", "move.py", "reward.py", "update\_q.py", "control.py"\]

Each behavior represents a part of the reinforcement learning loop. It also contains fields for storing reward information and parameters applicable to the RL update algorithm.

```
 agent = {
   "behaviors": [“validate_action.py”, "action.py", "move.py", "reward.py",  "update_q.py", "control.py"],
   "agent_name": "rl",
   "q_table": q_table,
   "actions": actions,
   "position": [2, 0],
   "reward": 0,
   "episode_reward": 0,
   "episode": 0,
   "rewards": [],
   "episodes": [],
   "epsilon": context.globals()["epsilon"],
   "learning_rate": context.globals()["learning_rate"],
   "steps": 1
}
```

#### **Actions**

_Validate\_actions.py_

Every timestep the agent can consider taking one of four actions - it can move up, down, right, or left.

```
 actions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1]
  ]
```

At certain positions in gridworld, some of these actions would take it outside the bounds of our simulation. To prevent that, this behavior filters all possible actions to a subset of valid actions. It then stores these in `state[“actions”]`.

_action.py_

The agent now chooses which action to take based on how well a given action has historically performed in the long run, on average, at that position. The 'quality' of an action in a given location is stored in the agent's `q_table`; over many runs it will develop an accurate valuation of actions at specific spots. The **policy** of a Q-Learning agent can be thought of as the collection of values in its `q_table` (along with how it samples those values)

_**Note**: The q\_table is an array of arrays; the first level represents locations in the gridworld, the second level represents actions. The value of \[location\] \[action\] is a 'quality' score._

To make this more concrete, consider the scenario where the agent is in (6,8), next to the goal on its right.

![](images/rl-goal1.png)

The agent is one step away from a high reward

The optimal action is clearly to take the action (1,0) which will move the agent on to the goal state at (7,8). So the quality value of the action (1,0) at state (6,8) should be high, at least relative to all the other actions it could select from.

However, at the start, when the agent has no idea whether an action is good at a specific location, how does it choose which to execute? How does it learn that (1,0) is a good choice? And finally, how do we prevent an agent from prematurely optimizing and choosing an action that might appear good, but is not in fact as good as another possible choice?

This is a classic problem in reinforcement learning - and life in general - called the **explore-exploit tradeoff**. We want the agent to explore enough that we can be confident it has relatively correct _q-values_ for a given action at a given location, but eventually we want the agent to start to choose the best action.

With Q-Learning, this tradeoff is handled by a **hyperparameter** in the simulation called _epsilon_, which is defined in **globals.json** and is then stored on the agent as an attribute at the start of the simulation. Every timestep, when choosing an action, the agent randomly generates a number between and 1. If the value is less than the value of epsilon the agent will randomly select one of the four actions; if the value is greater than epsilon, the agent will select the action that has the highest q-value.

```
  # If exploiting, select best action from q_table
  exploit = random.random() > state["epsilon"]

  if exploit:
    q_values = state["q_table"][state["q_state"]]
    state["action"] = context.globals()["actions"][int(argmax(q_values))]

  # Else select a random action from potential actions
  else:
    state["action"] = state["actions"][random.choice(len(state["actions"]))]
```

_You can use the HASH optimization engine to automatically optimize hyperparameters to find the set that best selects actions._

#### **Reward**

_reward.py_

After the agent has decided on an action, it can compute the outcome of that action and receive a reward based on the new state of the simulation.

In this simulation, there are three potential reward adjustments.

- If the agent encounters an obstacle, the reward is decreased by the value of `obstacle_penalty`.

- If the agent gets to the goal, the reward is increased by the value of the `goal_reward`.

- Else, every time step where the agent hasn't hit an obstacle or a goal, the agent’s cumulative reward decreases by the `move_penalty`.

Adding a cost to moves is important as it incentivizes the agent to find the shortest path to the goal state.

#### **Update**

_update\_q.py_

The heart of the Q-learning algorithm is the `q_table` and the update function. We already described the `q_table` - an array of arrays storing scores for actions at locations - and the update function is how the scores are set and modified. After the state is set (i.e. the action has been executed) and the reward received, the agent retrieves the maximum future `q_score` available from that state, and then uses this in conjunction with any rewards received to set the `q_score` of the action.

The intuition here is that the value of a particular action depends both on the immediate rewards/penalties the agent receives from it, and from how well it opens up future highly valuable actions to take. Actions that may, in the moment, be more costly than another action - for instance moving farther away from the goal state - might still be a higher quality action to take - for instance if it avoids a set of obstacles.

The relative value of _immediate_ rewards vs _future_ rewards are determined by the discount\_factor hyperparameter - a higher `discount_factor` represents a preference for rewards in the future over rewards on that timestep. Additionally the `learning_rate` hyperparameter determines how much of an update to make to the existing `q_value`. A high `learning_rate` means it will update more, a low learning rate means it will update less from a score in a specific episode.

#### **Control**

_control.py_

Control handles the 'meta' part of the simulation. Once the agent has reached a stop point, either because it hit an obstacle, found the goal, or ran out of time, we want to reset the agent back to the starting point and adjust the hyperparameters, decaying epsilon and the learning rate.

**control.py** checks if the steps are equal to an episode length or if the agent's state is done, and if so saves the reward for that episode (useful for plotting the convergence of the agents algorithm), sets the agent back to the start position, and then multiplies the epsilon and learning by a decay value.

#### **Other Behaviors**

_move.py, control.py_

Action, Reward, Update, and Control are the general framework common to almost all reinforcement learning simulations. The specific behavior names might change, but the pattern remains the same.

But, outside of this design pattern, there are context specific behaviors an agent will want to execute for its given environment. In this simulation, this is **move.py**, which handles actually taking the action selected by the agent and executing it in the new environment.

## Outcome

When we run the simulation, we can see in the 3D viewer the agent moving about and landing on obstacles or the goal, being reset, and starting over. Over hundreds of runs, its `q_table` values reflect quality scores that, as it begins to exploit more than explore, will guide it more frequently to the goal state while avoiding obstacles.

![](images/Kapture-2021-07-08-at-16.25.16.gif)

In the beginning, it is lost.

![](images/Kapture-2021-07-08-at-16.26.38.gif)

Over many time steps, it finds a way.

To get a more quantitative measure of how the agent is performing, switch to the analysis view and watch the rewards per episode increasingly converge to a steady state positive value.

![](images/rl-reward.png)

Agent converging on path with maximum reward

The speed at which the agent converges to a steady, positive reward state will be determined in large part by the hyperparameters of the simulation. The reward size, penalty size, epsilon, etc. will all affect the behavior of the agent. You can try manually setting different values in global and see what happens, or you can use [the HASH optimization engine](https://docs.hash.ai/core/creating-simulations/experiments/optimization-experiments) to select hyperparameters that maximize the reward.

To build your own RL simulations with HASH, you can experiment with the library of RL behaviors shared from this simulation. They contain generic versions of the action, reward, and update behaviors - you can use the Q-learning algorithm or implement your own custom algorithm. For inspiration [take a look at a prisoners dilemma simulation](https://hash.ai/@hash/prisoners-dilemma-with-q-learning) with two agents leveraging the QRL libraries. And while they're by no means a replacement for the full fledged RL implementations you'll find in frameworks like Tensorflow or PyTorch, they're a great way to start experimenting with RL.

Over the coming months we’ll be releasing HASH’s long-awaited hEngine, together with specific reinforcement learning features, including support for external frameworks, making it as easy as possible to add powerful learning capabilities to your simulations.
