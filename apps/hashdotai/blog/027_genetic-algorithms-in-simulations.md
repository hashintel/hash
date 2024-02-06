---
title: "Genetic Algorithms in Simulations"
date: "2021-08-04"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/c565b301-53b2-41f2-8773-f0d274147700/public
categories: 
  - "Simulation"
  - "AI"
---

Genetic algorithms follow the logic of evolution - from a pool of solutions, evolve the best solution for a given problem. This is an effective approach to finding optimal solutions to tricky, complex multi-dimensional optimization problems.

The basic process is an evolutionary loop:

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/369d0766-4b3e-4266-324a-aab3b50fb500/public)

A number of potential solutions are created. They pass through a selection filter that selects solutions based on their fitness, the ones that moves up the 'fitness landscape', closer to the peak of the best possible solutions. Then, these solutions become the seeds for the next generation of potential solutions, one of which might be a superior solution. And the process continues.

Join us in this article as we [explore the genetic algorithm-based "Employee Scheduling" simulation ->](https://hash.ai/@hash/genetic-programming)

## Overview

In the demo simulation, we use a genetic algorithm to find the best workforce schedule. Many companies face the challenge of effectively maximizing coverage of a schedule and meeting demand. We can model the problem as a series of constraints.

- **Does an employee work a reasonable number of hours?** An employee schedule should aim for above and below a given number of hours.
- **Are employee hours spread out over a day?** It doesn't make sense to have ten employees working from 9am to 10am, and no employees from 10am to 11am. An ideal employee coverage is spread out across the full day.
- **Do all employees contribute?** If a group of ten employees is working at a company, it would be weird if nine of them were working and one never worked.

Each agent in the simulation is a potential employee schedule. Some will be better than others at meeting these constraints, and over the course of the simulation we’ll evolve better schedules.

There are four behaviors that implement the genetic algorithm:

1. Fitness: A behavior that assesses the fitness of a given solution by comparing it against a set of constraints and costs.
1. Evaluate: Normalize and compare agent fitnesses. Select a subset of agents based on their 'fitness'.
1. Crossover: Take this subset of solutions and swap aspects of them, 'breeding' new solutions and using them in the next iteration.
1. Mutate: Introduce mutations into the new solutions; random changes that may or may not make them more fit.

There are two types of agents in use during a GA optimization: solution agents and a manager agent.

Solution agents have two key attributes:

```
"bitfield": <string>, 
"fitness": <float>
```

A bitfield represents the solution - it's a series of integers that map to the company’s work schedule. You can think of the full string as the combination of each employee’s start time of their shift, and the length of their shift. So the length of the string will be the number of bits needed to encode the shift information multipled by the number of employees.

The fitness attribute is a measure of how well the potential solution fits the constraints of the fitness evaluation.

These constraints are stored in `fitness.js`.

Every timestep a solution runs `fitness.js`, stores the results, and shares them with the manager agent.

The manager agent runs `evaluate.js` and selects the best - the manager agent then creates a new pool of solutions. The solution's are generated from a `crossover` and `mutation` of existing solutions. The existing solutions, except for the best one, are removed from the simulation. Over a series of time steps we get closer to the optimum.

## Simulation

[Open the genetic programming simulation ->](https://hash.ai/@hash/genetic-programming)

In our simulation, the current best solution is visualized by a set of colored bars representing the employee shifts. Each employee is represented by a different color, and the bar extends from the beginning to the end of their shift. This allows you to easily see how many employees are working at any given time.

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/5a2e6656-4628-4865-c7e8-b924bbdbf200/public)

The current best solution, represented by each employee's work schedule

At the start of the simulation, the fitness of the different solutions is relatively low, but you can see in jumps and spurts how the solution set discovers better configurations. After a hundred time steps the solution has plateaued at the best possible fitness score.

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/9ce020be-f8bb-4311-f85b-0fc6155b7b00/public)

Genetic algorithms are best employed when there's a clear fitness function to optimize for and where there are many potential parameters to tweak. You can use them in conjunction with [HASH optimization experiments](https://hash.ai/docs/simulation/creating-simulations/experiments/optimization-experiments) to automatically generate good solutions from your simulations.

You can find a version of this simulation [written in Python here](https://hash.ai/@hash/genetic-programming-employee-shifts-python).
