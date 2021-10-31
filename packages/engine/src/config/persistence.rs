use crate::{
    hash_types::Properties,
    proto::ExperimentRunBase,
    simulation::packages::{creator::PackageCreators, output::packages::OutputPackagesSimConfig},
};

#[derive(Clone)]
pub struct Config {
    pub output_config: OutputPackagesSimConfig,
}

impl Config {
    pub fn new_sim(
        exp_config: &super::ExperimentConfig<ExperimentRunBase>,
        globals: &Properties,
        package_creators: &PackageCreators,
    ) -> crate::simulation::Result<Config> {
        let output_config = package_creators.get_output_persistence_config(exp_config, globals)?;
        Ok(Config { output_config })
    }
}
