> **Notice**: This branch is currently a _work-in-progress_ and as such this documentation is subject to heavy change. Clarifications and improvements will be coming in the near future, however in the mean-time a high-level explanation of the main concepts is provided below to guide understanding of the source-code and project structure. 
> 
>**An updated README including setup and usage instructions will follow shortly.**

<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hengine-github-readme-header%402x.png">
</p>
<div align="center">
 <a href="https://github.com/hashintel/engine/blob/master/LICENSE.md"><img src="https://cdn-us1.hash.ai/assets/license-badge-sspl.svg" alt="Server Side Public License" /></a>
 <a href="https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine"><img src="https://img.shields.io/discord/840573247803097118" alt="Join HASH on Discord" /></a>
</div>

# hEngine
[HASH Engine](https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_engine) (or **hEngine**) is the computational simulation engine at the heart of [HASH](https://hash.ai/platform?utm_medium=organic&utm_source=github_readme_engine) published under the terms of the Server-Side Public License (based on GPLv3, and created by MongoDB). The version currently released here contains several notable differences to the hosted version powering [hCore](https://hash.ai/platform/core?utm_medium=organic&utm_source=github_readme_engine) and [hCloud](https://hash.ai/platform/cloud?utm_medium=organic&utm_source=github_readme_engine).

## Issue Tracking
We use [GitHub Issues](https://github.com/hashintel/engine/issues) to help prioritize and track bugs and feature requests for HASH. This includes hEngine, as well as our **hCore** IDE, and the [**HASH.ai site**](https://hash.ai/platform/index?utm_medium=organic&utm_source=github_readme_engine). You can also report issues and get support on our public [Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine). Please submit any issues you encounter.

## Documentation
Our [simulation docs](https://hash.ai/docs/simulation?utm_medium=organic&utm_source=github_readme_engine) contain beginner guides and in-depth tutorials for **hCore** today.

The [HASH glossary](https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_engine) contains helpful explainers around key modeling, simulation and AI-related terms and concepts.

## Questions & Support
We're building a community of people who care about enabling better decision-making through modeling and simulation. Our [support forum](https://hash.community/?utm_medium=organic&utm_source=github_readme_engine) and [HASH community Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine) (requires login) are both great places to meet other modelers and get help.

## Main Concepts

Being familiar with running experiments and simulations on the HASH platform will help a lot with understanding the Engine. The [docs](https://hash.ai/docs/simulation/?utm_medium=organic&utm_source=github_readme_engine) are also a good place to search for clarification on some terms used below when unclear.

### High-level Overview

> **Note** the links provided in the following section point towards the general relevant parts of the codebase, this section can be treated as an initial guide to the folder and source-code structure.

#### Starting an Experiment / the CLI
Once a v0.1 release bas been finalized, we intend for experiments to be started through the [CLI](./src/cli), the main entry-point to the engine. The CLI will be responsible for parsing input, and starting Workers and simulation runs.

#### Workers
Most logic relating to the model (including, most importantly, user provided behaviors) is executed on [Runners](./src/worker/runner). These are execution environments implemented in Python, JavaScript, or Rust. One of each Language Runner is managed by a single [Worker](./src/worker). Workers then in turn belong to a Worker Pool, a collection of Workers that serve a single experiment.

#### Simulation Runs and the Package System
After initialization, the core of the flow of a [simulation](./src/simulation) is handled within the 'main loop', a pipeline of logic that's applied to each step of the simulation. At the core of this implementation is the Simulation Package System.

A Simulation Package is a contained set of logic belonging to one of the following types:

* Initialization
* Context
* State
* Output

Initialization packages are run before starting the main loop of the simulation. They're responsible setting up the initial state of the agents within the simulation.

Context packages deal with state that encompasses contextual information surrounding the agents within a simulation.

State packages interact with actual agent-state, including things such as executing agent behaviors and correcting spatial positioning.

Output packages are responsible for creating feedback to be given to the user about the simulation run's state, including things like saving snapshots of agent-state or providing analysis and network visualization.

Upon using the initialization packages to initialize the run, the main loop is started which consists of a pipeline going from context packages -> state packages -> output packages for every step.

The packages utilize a [communication implementation](./src/simulation/comms) to interface with the [Workers](./src/worker/comms) mostly through the use of of defined types of [Tasks](./src/simulation/task). The communication therefore defines the control-flow of the Runner's executions. Any substantial data that isn't encapsulated within a message is shared that between Packages and Runners through the [DataStore](./src/datastore).

#### DataStore

The [DataStore](./src/datastore) is the backend responsible for keeping the data between the simulation run main loops and language runners in sync. It encapsulates logic surrounding read/write access, as well as low-level shared memory representation.