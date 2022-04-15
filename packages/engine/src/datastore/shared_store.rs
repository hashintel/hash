use std::{collections::HashMap, sync::Arc};

use memory::shared_memory::MemoryId;
use stateful::global::Dataset;

use crate::{config::ExperimentConfig, datastore::error::Result, proto::ExperimentRunTrait};

/// This is an object we use to manage sharing access to data that's static across simulation runs
/// within an experiment, such as datasets.
#[derive(Clone)]
pub struct SharedDatasets {
    pub datasets: HashMap<String, Arc<Dataset>>,
}

impl SharedDatasets {
    pub fn new(config: &ExperimentConfig) -> Result<SharedDatasets> {
        let datasets = &config.run.base().project_base.datasets;
        let mut dataset_batches = HashMap::with_capacity(datasets.len());
        for dataset in &config.run.base().project_base.datasets {
            let dataset_name = dataset.shortname.clone();
            let dataset_batch = Dataset::from_shared(dataset, MemoryId::new(config.run.base().id))?;
            dataset_batches.insert(dataset_name, Arc::new(dataset_batch));
        }

        Ok(SharedDatasets {
            datasets: dataset_batches,
        })
    }
}
