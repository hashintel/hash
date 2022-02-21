/*!
The central component of the HASH simulation engine is the Package system.

The only presumption that the engine makes about a simulation project is that it creates
a set of agents backed by the Datastore, which may have their state changed as
simulation time progresses.

Using only this presumption clearly does not provide enough utility to a simulation
so packages can be added on top of that to create a simulation engine which provides
the user with a wide array of functionality.

For example, if the `BehaviorExecution` State Package is enabled, then the engine
will execute behaviors on agents, depending on the behavior lists of the agents.

A default collection of packages are usually used for the engine (
see [`PackageConfig`](crate::simulation::config::PackageConfig)).
 */

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

pub mod prelude {
    pub use async_trait::async_trait;

    pub use super::{
        super::comms::Comms, context::Package as ContextPackage, init::Package as InitPackage,
        output::Package as OutputPackage, state::Package as StatePackage,
    };
    pub use crate::{
        config::{ExperimentConfig, SimulationConfig},
        datastore::{
            prelude::*,
            table::{context::Context, state::State},
        },
        simulation::{Error, Result},
    };
}

use serde::Serialize;

use crate::simulation::package::{deps::Dependencies, id::PackageId};

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
