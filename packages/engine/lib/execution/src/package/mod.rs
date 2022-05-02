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
//! # use execution::{
//! #     package::{
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
//! Next, the package needs to be added to the known package [`Name`](state::Name)s, to the
//! [`METADATA`](state::METADATA), and to the [`PackageCreator`](state::PackageCreator):
//!
//! ```
//! # use std::{collections::HashMap, sync::Arc};
//! #
//! # use execution::{
//! #     package::{Dependencies, PackageInitConfig, PackageType},
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

mod comms;
mod config;
mod dependencies;
mod message;
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
    message::TaskMessage,
    name::PackageName,
    package_type::PackageType,
    task::PackageTask,
};
use crate::Result;

pub trait PackageCreator: Sync + Send {
    /// A message sent to all workers before running any packages.
    ///
    /// This allows package creators to pass any kind of configuration from their Rust runtime to
    /// their Language Runner counterpart all.
    ///
    /// Compared to [`Package::start_message()`], the data returned with this method will be
    /// available for all simulations. Also, this should not be implemented for packages but
    /// their respective package creator.
    fn init_message(&self) -> Result<serde_json::Value> {
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
    /// Compared to [`PackageCreator::init_message()`], the data returned with this method will only
    /// be available for that specific simulation where the package has been instantiated.
    fn start_message(&self) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }
}

pub trait MaybeCpuBound {
    fn cpu_bound(&self) -> bool;
}
