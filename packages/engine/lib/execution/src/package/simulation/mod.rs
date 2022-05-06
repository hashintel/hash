//! # Simulation packages
//!
//! The only invariant that the engine expects of a simulation project is that it creates a set of
//! [`Agent`]s backed by the data defined in [`stateful`], which may have their state changed as
//! simulation time progresses.
//!
//! The rest of the engine logic itself is defined within packages, self-contained implementations
//! that can affect the simulation initialisation, logic, and outputs.
//!
//! For example, if the [`BehaviorExecution`] State Package is enabled, then the engine will execute
//! behaviors on agents, depending on the behavior lists of the agents.
//!
//! [`Agent`]: stateful::agent::Agent
//! [`BehaviorExecution`]: state::behavior_execution::BehaviorExecution
//!
//! ## Package types
//!
//! The the simulation [`Package`] System consists of 4 types of interfaces for 4 types of
//! simulation packages:
//! - [`init`]alization
//! - [`context`]
//! - [`state`]
//! - [`output`]
//!
//! Each of these have different effects and entry points. All packages are either independent or
//! state explicit [`Dependencies`] on other [`Package`]s. Also, all packages can be stateful. As
//! statefulness implies initialization of state, each stateful package can have an initialization
//! phase, either in [`PackageCreator::worker_init_message()`] or in
//! [`Package::simulation_setup_message()`].
//!
//! For more information on the different [`PackageType`]s please see the corresponding module
//! documentation.
//!
//! ## Package execution
//!
//! The [`InitPackage`]s will be run only once at the beginning of a simulation.
//! [`context`], [`state`], and [`output`] packages will be run in every simulation step in that
//! order. [`ContextPackage`]s and [`OutputPackage`]s will run in parallel, while [`StatePackage`]s
//! are running sequentially. This is because each [`PackageType`] has a different signature when
//! invoking and [`StatePackage`]s requires write access to the [`State`](stateful::state::State).
//!
//! [`InitPackage`]: init::InitPackage
//! [`ContextPackage`]: context::ContextPackage
//! [`StatePackage`]: state::StatePackage
//! [`OutputPackage`]: output::OutputPackage
//!
//! ## Creating a new package
//!
//! The following example will guide through creating and enabling a new, simple state package.
//!
//! First of all, the [`StatePackage`](`state::StatePackage`) and its
//! [`StatePackageCreator`](state::StatePackageCreator) has to be created:
//!
//! ```
//! # use std::sync::Arc;
//! #
//! # use async_trait::async_trait;
//! # use execution::{
//! #     package::simulation::{
//! #         state::{StatePackage, StatePackageCreator},
//! #         Package, PackageComms, PackageCreator, PackageCreatorConfig, PackageInitConfig,
//! #     },
//! #     Result,
//! # };
//! # use stateful::{context::Context, field::FieldSpecMapAccessor, state::State};
//! # use tracing::Span;
//! pub struct GreetingPackage;
//!
//! impl Package for GreetingPackage {
//!     fn simulation_setup_message(&self) -> Result<serde_json::Value> {
//!         Ok(serde_json::Value::Null)
//!     }
//! }
//!
//! #[async_trait]
//! impl StatePackage for GreetingPackage {
//!     async fn run(&mut self, _state: &mut State, _context: &Context) -> Result<()> {
//!         println!("Hello HASH!");
//!         Ok(())
//!     }
//!
//!     fn span(&self) -> Span {
//!         Span::current()
//!     }
//! }
//!
//! pub struct GreetingCreator;
//!
//! impl PackageCreator for GreetingCreator {
//!     fn worker_init_message(&self) -> Result<serde_json::Value> {
//!         Ok(serde_json::Value::Null)
//!     }
//! }
//!
//! impl<C> StatePackageCreator<C> for GreetingCreator {
//!     fn create(
//!         &self,
//!         config: &PackageCreatorConfig,
//!         init_config: &PackageInitConfig,
//!         comms: PackageComms<C>,
//!         accessor: FieldSpecMapAccessor,
//!     ) -> Result<Box<dyn StatePackage>> {
//!         Ok(Box::new(GreetingPackage))
//!     }
//! }
//! ```
//!
//! Next, the package needs to be added `StatePackageName`, to the
//! `METADATA`, and to the `PackageCreators`:
//!
//! ```
//! # use std::{collections::HashMap, sync::Arc};
//! #
//! # use execution::{
//! #     package::simulation::{Dependencies, PackageInitConfig, PackageType},
//! #     Result,
//! # };
//! # use stateful::field::PackageId;
//! # struct PackageCreators;
//! # struct GreetingCreator;
//! # impl GreetingCreator {
//! #     fn dependencies() -> Dependencies {
//! #         Dependencies::new()
//! #     }
//! # }
//! # #[derive(PartialEq, Eq, Hash)]
//! pub enum Name {
//!     BehaviorExecution,
//!     Topology,
//!     Greeting,
//! }
//!
//! impl PackageCreators {
//!     pub(crate) fn initialize_for_experiment_run(
//!         &self,
//!         experiment_config: &Arc<PackageInitConfig>,
//!     ) -> Result<()> {
//!         use Name::{BehaviorExecution, Greeting, Topology};
//!         # let mut m = HashMap::new();
//!         // ...
//!         m.insert(Greeting, Box::new(GreetingCreator));
//!         // ...
//!         # Ok(())
//!     }
//! }
//!
//! # pub struct PackageMetadata { id: Option<PackageId>, dependencies: Dependencies };
//! # lazy_static::lazy_static! {
//! pub static ref METADATA: HashMap<Name, PackageMetadata> = {
//!     use Name::{BehaviorExecution, Greeting, Topology};
//!     # let mut id_creator = std::iter::repeat(PackageId::from(0));
//!     # let mut m = HashMap::new();
//!     // ...
//!     m.insert(
//!         Greeting,
//!         PackageMetadata {
//!             id: id_creator.next(),
//!             dependencies: GreetingCreator::dependencies(),
//!         },
//!     );
//!     // ...
//!     # m
//! };
//! # }
//! ```
//!
//! As a final step, the package has to be loaded. As currently there is no way for configuring
//! packages dynamically, this should be added to the default packages in the package
//! `PackageConfig`:
//!
//! ```
//! # struct Config;
//! # enum StatePackage { BehaviorExecution, Topology, Greeting };
//! impl Config {
//!     fn default_state_packages() -> Vec<StatePackage> {
//!         vec![
//!             StatePackage::BehaviorExecution,
//!             StatePackage::Topology,
//!             StatePackage::Greeting,
//!         ]
//!     }
//! }
//! ```
// TODO: Add example for creating a runner-based package
//   see https://app.asana.com/0/0/1202153839209941/f
//   Things to cover:
//    - Task has to be added for the package type
//    - package.js and package.py has to be created
//    - which functions has to be added?
//    - ...
// TODO: Add docs on different package types (also mention the different signatures)

pub mod context;
pub mod init;
pub mod output;
pub mod state;

mod comms;
mod config;
mod dependencies;
mod name;
mod package_type;
mod task;

pub(crate) use self::name::{PackageIdGenerator, PackageMetadata};
pub use self::{
    comms::{Comms, PackageComms},
    config::{
        OutputPackagesSimConfig, PackageCreatorConfig, PackageInitConfig, PersistenceConfig,
        SimPackageArgs,
    },
    dependencies::Dependencies,
    name::PackageName,
    package_type::PackageType,
    task::PackageTask,
};
use crate::Result;

pub trait PackageCreator: Send + Sync {
    /// A message sent to all workers before running any packages.
    ///
    /// This allows package creators to pass any kind of configuration from their Rust runtime to
    /// their Language Runner counterpart for the experiment.
    ///
    /// Compared to [`Package::simulation_setup_message()`], the data returned with this method will
    /// be available for all simulations and is sent **once per experiment**.
    fn worker_init_message(&self) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }

    /// Get the package names that packages created by this creator will depend on.
    fn dependencies() -> Dependencies
    where
        Self: Sized,
    {
        Dependencies::empty()
    }
}

// Generics for packages
//
// Note that generalization cannot be done for all package traits.
// See https://github.com/rust-lang/rust/issues/20400 for why Init, Context, State and Output
// package (and other respective) traits cannot be (sensibly) generalized into one even though they
// are clearly disjoint.

pub trait Package: Send {
    /// A message sent to the workers before the package is running.
    ///
    /// This allows packages to pass any kind of configuration from their Rust runtime to their
    /// Language Runner counterpart for a specific simulation.
    ///
    /// Compared to [`PackageCreator::worker_init_message()`], the data returned with this method
    /// will only be available for that specific simulation where the package has been instantiated
    /// and is sent **once per simulation**.
    fn simulation_setup_message(&self) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }
}

/// Packages, which are running in parallel, may be bound by the CPU.
///
/// If a package is CPU bound, it's executed on a separate thread, otherwise it's executed in the
/// same thread.
pub trait MaybeCpuBound {
    fn cpu_bound(&self) -> bool;
}
