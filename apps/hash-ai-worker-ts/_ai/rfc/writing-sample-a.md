# R\&D Planning Prototype, reflections

# Overview

Alongside high-level requirement exploration and literature review, we have begun prototyping aspects of long-running agentic R\&D orchestration and execution, beginning with plan generation.

# Background and initial assumptions

We began with “plan creation” as it is a key design challenge in the problem space, and the success of any R\&D effort will be significantly affected by the quality of the plan driving it. 

There are other crucial factors in successful agentic R\&D, such as agent context management, task specification, output evaluation, etc, which we intend to turn to in future, and are also the subject of exploratory work by other TA1.3 teams (e.g. UMich is particularly focused on context handling).

We assume that we will require a dynamic directed graph structure for plans, because they will both be formalized as Petri nets and will need to be executable by a task orchestrator in some way. 

Finally, the complex R\&D use case will require handling uncertainty and evolving beliefs/assumptions, in ways which most workflow use-cases in the agent-planning space currently do not, and so we wanted to begin initial design explorations of how these might be modelled and what implications they have.

# Technical basis

We explored the landscape of agent development frameworks and chose to use [Mastra](https://mastra.ai/) (built upon the [Vercel AI SDK](https://ai-sdk.dev/)) as a general representation/proxy for the patterns and primitives around which the field is converging: agents, tools, evals, and graph-like task orchestration (“steps” and “workflows”, in Mastra). 

It is also a convenient harness and test bed for what we wanted to explore, as well as affording some ‘out of box’ leverage in terms of observability in development and testing.

We had some uncertainty about the viability of the kind of dynamism we were anticipating (the ability to execute arbitrary plans): while Mastra’s “workflows” are explicitly schema-connected graphs (with branching, parallelism, loops etc.), most of their documentation and demos address only the requirements of static workflows that represent well-known pre-defined procedures. 

Therefore part of the aim of the prototype would be to explore whether dynamic “compilation” and execution of an intermediate-representation of a workflow was possible within a single (parent) workflow-run, to assess whether Mastra remained viable as a short-term development aid.

# Prototype concept

![][image1]

The core goals were to:

1. design a “plan” specification, that would constitute a graph-like representation of steps (tasks), allowing for dependency and concurrency; and then

2. “compile” this dynamically to a Mastra workflow. If we could prove out that dynamic pattern, it would provide a basis for more advanced permutations; and

3. explore different aspects of R\&D planning.

The basic design for this prototype consisted roughly of:

* A primary “planner” agent

* An initial plan step, with

  * Structural and logical validation of its outputs 

  * Conditional “revision” loop in case of failure

* A compile-and-execute step, to

  * Compile plan to (sub-)workflow

  * Execute this workflow with event passthrough
