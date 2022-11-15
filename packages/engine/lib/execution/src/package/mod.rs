//! # The [HASH Engine] Package System
//!
//! The Package System defines the building blocks of HASH simulations, specifying the stages of
//! execution, and the types of logic that can be ran.
//!
//! There a two kinds of packages: [Simulation Packages] and [Experiment Packages]. Simulation
//! packages have control over a single simulation run and determine the layout of a single step.
//! Experiment Packages have a high-level control over multiple simulation runs within an experiment
//! run. They are able to start/stop/pause simulation runs.
//!
//! [HASH Engine]: https://hash.ai/platform/engine
//! [Simulation Packages]: simulation
//! [Experiment Packages]: experiment

pub mod experiment;
pub mod simulation;
