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
//! # use async_trait::async_trait;
//! # use hash_engine_lib::{
//! #     config::{ExperimentConfig, SimRunConfig},
//! #     simulation::{
//! #         comms::package::PackageComms,
//! #         package::{
//! #             ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg},
//! #             state::{Package, PackageCreator},
//! #         },
//! #         Result,
//! #     },
//! # };
//! # use stateful::{context::Context, field::FieldSpecMapAccessor, state::State};
//! # use tracing::Span;
//! pub struct GreetingPackage;
//!
//! impl GetWorkerSimStartMsg for GreetingPackage {
//!     fn get_worker_sim_start_msg(&self) -> Result<serde_json::Value> {
//!         Ok(serde_json::Value::Null)
//!     }
//! }
//!
//! #[async_trait]
//! impl Package for GreetingPackage {
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
//! impl GetWorkerExpStartMsg for GreetingCreator {
//!     fn get_worker_exp_start_msg(&self) -> Result<serde_json::Value> {
//!         Ok(serde_json::Value::Null)
//!     }
//! }
//!
//! impl PackageCreator for GreetingCreator {
//!     fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>>
//!     where
//!         Self: Sized,
//!     {
//!         Ok(Box::new(GreetingCreator))
//!     }
//!
//!     fn create(
//!         &self,
//!         _config: &Arc<SimRunConfig>,
//!         _comms: PackageComms,
//!         _accessor: FieldSpecMapAccessor,
//!     ) -> Result<Box<dyn Package>> {
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
//! #         package::{deps::Dependencies, id::PackageIdGenerator, PackageMetadata, PackageType},
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
//!         m.insert(Greeting, GreetingCreator::new(experiment_config)?);
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
pub mod deps;
pub mod ext_traits;
pub mod id;
pub mod name;
pub mod package;
pub mod run;
pub mod worker_init;

use serde::Serialize;
use stateful::field::PackageId;

use crate::simulation::package::deps::Dependencies;

#[derive(Clone, Copy, Debug)]
pub enum PackageType {
    Init,
    Context,
    State,
    Output,
}

impl PackageType {
    pub(crate) fn as_str(&self) -> &str {
        match *self {
            PackageType::Init => "init",
            PackageType::Context => "context",
            PackageType::State => "state",
            PackageType::Output => "output",
        }
    }
}

impl Serialize for PackageType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.as_str().serialize(serializer)
    }
}

impl From<PackageType> for flatbuffers_gen::package_config_generated::PackageType {
    fn from(package_type: PackageType) -> Self {
        match package_type {
            PackageType::Init => flatbuffers_gen::package_config_generated::PackageType::Init,
            PackageType::Context => flatbuffers_gen::package_config_generated::PackageType::Context,
            PackageType::State => flatbuffers_gen::package_config_generated::PackageType::State,
            PackageType::Output => flatbuffers_gen::package_config_generated::PackageType::Output,
        }
    }
}

pub struct PackageMetadata {
    id: PackageId,
    dependencies: Dependencies,
}

impl PackageMetadata {
    pub fn new(id: PackageId, dependencies: Dependencies) -> Self {
        Self { id, dependencies }
    }
}
