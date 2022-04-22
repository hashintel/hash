//! The Package System defines the building blocks of HASH Simulation, specifying the stages of
//! execution, and the types of logic that can be ran.
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
//! A default collection of packages are usually used for the engine (
//! see [`PackageConfig`](crate::simulation::config::PackageConfig)).
// TODO: Create docs to explain package system uses and how to extend
//   see https://app.asana.com/0/1199548034582004/1201644736959126/f
//!
//! # Creating a new package
//!
//! The following example will guide through creating and enabling a new, simple state package.
//!
//! First of all, the [`Package`](`state::Package`) and its
//! [`PackageCreator`](state::PackageCreator) has to be created:
//!
//! ```
//! # use std::sync::Arc;
//! #
//! # use async_trait::async_trait;
//! # use hash_engine_lib::{
//! #     config::{ExperimentConfig, SimRunConfig},
//! #     simulation::{
//! #         comms::package::PackageComms,
//! #         package::{
//! #             ext_traits::{Package, PackageCreator},
//! #             state::{StatePackage, StatePackageCreator},
//! #             PackageInitConfig,
//! #         },
//! #         Result,
//! #     },
//! # };
//! # use stateful::{context::Context, field::FieldSpecMapAccessor, state::State};
//! # use tracing::Span;
//! pub struct GreetingPackage;
//!
//! impl Package for GreetingPackage {
//!     fn start_message(&self) -> Result<serde_json::Value> {
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
//!     fn init_message(&self) -> Result<serde_json::Value> {
//!         Ok(serde_json::Value::Null)
//!     }
//! }
//!
//! impl StatePackageCreator for GreetingCreator {
//!     fn create(
//!         &self,
//!         _config: &Arc<SimRunConfig>,
//!         _init_config: &PackageInitConfig,
//!         _comms: PackageComms,
//!         _accessor: FieldSpecMapAccessor,
//!     ) -> Result<Box<dyn StatePackage>> {
//!         Ok(Box::new(GreetingPackage))
//!     }
//! }
//! ```
//!
//! Next, the package needs to be added to the known package [`Name`](state::Name)s, to the
//! [`METADATA`](state::METADATA), and to the [`PackageCreator`](state::PackageCreator):
//!
//! ```
//! # use std::{collections::HashMap, sync::Arc};
//! # use hash_engine_lib::{
//! #     config::ExperimentConfig,
//! #     simulation::{
//! #         package::{ id::PackageIdGenerator, PackageMetadata, PackageType},
//! #         Result,
//! #     },
//! # };
//! # struct PackageCreators;
//! # struct GreetingCreator;
//! # impl GreetingCreator {
//! #     fn new(_: &ExperimentConfig) -> Result<()> {
//! #         Ok(())
//! #     }
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
//!         experiment_config: &Arc<ExperimentConfig>,
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
//! # lazy_static::lazy_static! {
//! pub static ref METADATA: HashMap<Name, PackageMetadata> = {
//!     use Name::{BehaviorExecution, Greeting, Topology};
//!     # let mut id_creator = PackageIdGenerator::new(PackageType::State);
//!     # let mut m = HashMap::new();
//!     // ...
//!     m.insert(
//!         Greeting,
//!         PackageMetadata::new(
//!             id_creator.next(),
//!             GreetingCreator::dependencies(),
//!         ),
//!     );
//!     // ...
//!     # m
//! };
//! # }
//! ```
//!
//! As a final step, the package has to be loaded. As currently there is no way for configuring
//! packages dynamically, this should be added to the default packages in the package
//! [`Config`](crate::config::PackageConfig):
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

pub mod creator;
pub mod run;
pub mod worker_init;
