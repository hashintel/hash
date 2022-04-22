pub mod behavior_execution;
pub mod topology;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
};

use execution::package::{state::StatePackageName, PackageInitConfig};

use crate::simulation::{
    comms::Comms,
    package::state::{
        packages::{behavior_execution::BehaviorExecutionCreator, topology::TopologyCreator},
        StatePackageCreator,
    },
    Error, Result,
};

pub struct PackageCreators(
    SyncOnceCell<HashMap<StatePackageName, Box<dyn StatePackageCreator<Comms>>>>,
);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(&self, config: &PackageInitConfig) -> Result<()> {
        tracing::debug!("Initializing State Package Creators");
        use StatePackageName::{BehaviorExecution, Topology};
        let mut m = HashMap::<_, Box<dyn StatePackageCreator<Comms>>>::new();
        m.insert(BehaviorExecution, BehaviorExecutionCreator::new(config)?);
        m.insert(Topology, Box::new(TopologyCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize State Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(
        &self,
        name: &StatePackageName,
    ) -> Result<&Box<dyn StatePackageCreator<Comms>>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("State Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {} wasn't within the State Package Creators map",
                    name
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(
        &self,
    ) -> Result<Iter<'_, StatePackageName, Box<dyn StatePackageCreator<Comms>>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("State Package Creators weren't initialized"))?
            .iter())
    }
}
