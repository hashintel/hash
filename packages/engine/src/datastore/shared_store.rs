use std::{collections::HashMap, sync::Arc};

use crate::{
    config::ExperimentConfig,
    datastore::{batch::Dataset, error::Result},
    proto::ExperimentRunTrait,
};

// TODO rename to something more self-explanatory
/// This is an object we use to manage sharing access to data that's static across simulation runs
/// within an experiment, such as datasets.
#[derive(Clone)]
pub struct SharedStore {
    pub datasets: HashMap<String, Arc<Dataset>>,
}

impl SharedStore {
    pub fn new(config: &ExperimentConfig) -> Result<SharedStore> {
        let datasets = &config.run.base().project_base.datasets;
        let mut dataset_batches = HashMap::with_capacity(datasets.len());
        for dataset in &config.run.base().project_base.datasets {
            let dataset_name = dataset.shortname.clone();
            let dataset_batch = Dataset::new_from_dataset(dataset, &config.run.base().id)?;
            dataset_batches.insert(dataset_name, Arc::new(dataset_batch));
        }

        Ok(SharedStore {
            datasets: dataset_batches,
        })
    }
}
