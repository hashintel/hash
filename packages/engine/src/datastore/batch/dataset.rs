use crate::{
    datastore::prelude::*,
    proto::{ExperimentId, SharedDataset},
};

pub struct Dataset {
    pub(crate) memory: Memory,
    pub(crate) reload_state: Metaversion,
}

impl Batch for Dataset {
    fn memory(&self) -> &Memory {
        &self.memory
    }

    fn memory_mut(&mut self) -> &mut Memory {
        &mut self.memory
    }

    fn metaversion(&self) -> &Metaversion {
        &self.reload_state
    }

    fn metaversion_mut(&mut self) -> &mut Metaversion {
        &mut self.reload_state
    }

    fn maybe_reload(&mut self, _reload_state: Metaversion) -> Result<()> {
        // TODO: ret these errors
        // Error::from("Datasets are not updated");
        tracing::error!("Datasets are not updated");
        Ok(())
    }

    fn reload(&mut self) -> Result<()> {
        // TODO: ret these errors
        // Error::from("Datasets are not updated");
        tracing::error!("Datasets are not updated");
        Ok(())
    }
}

impl Dataset {
    pub fn new_from_dataset(dataset: &SharedDataset, experiment_id: &ExperimentId) -> Result<Self> {
        let dataset_name = dataset.shortname.clone();
        let dataset_size = dataset
            .data
            .as_ref()
            .map(|data| data.len())
            .unwrap_or_default();
        let mut memory =
            Memory::from_sizes(experiment_id, 0, dataset_name.len(), 0, dataset_size, false)?;
        let reload_state = Metaversion::default();
        memory.set_header(&dataset_name)?;
        let buffer = memory.get_mut_data_buffer()?;
        buffer.copy_from_slice(
            dataset
                .data
                .as_ref()
                .map(|data| data.as_bytes())
                .unwrap_or_default(),
        );
        Ok(Self {
            memory,
            reload_state,
        })
    }
}
