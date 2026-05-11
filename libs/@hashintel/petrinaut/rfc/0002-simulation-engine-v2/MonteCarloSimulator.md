The goal is to create another implementation of the Simulation Engine, that will support Monte Carlo simulation.

It should be another implementation, not an update of what is currently in core/simulation/simulator.

It will certainly have a different interface in a first time, but the goal will be to converge the API of the two implementations in the future, so that we can easily switch between them.

It should redo all the implementation, including the memory layout, which will only rely on a binary memory layout (Transitions states, Places states/counts/etc...).

When running the "meta" simulation, it should be provided a number of "concrete" simulations. Each "concrete" simulation will have a different seed initially.

Implement something simple and minimal, that will allow us to run a simple Monte Carlo simulation, and then we can iterate on it to add more features and optimizations.
