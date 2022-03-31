use storage::shared_memory::{Memory, Metaversion, Segment};

use crate::{
    datastore::error::Result,
    proto::{ExperimentId, SharedDataset},
};

// TODO: Datasets are just data in memory segments, not really batches, so the parent module should
//       be renamed or the `Dataset` struct should be moved.
pub struct Dataset {
    segment: Segment,
}

impl Dataset {
    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    pub fn new_from_dataset(dataset: &SharedDataset, experiment_id: &ExperimentId) -> Result<Self> {
        let metaversion = Metaversion::default().to_le_bytes();
        let dataset_name = &dataset.shortname;
        let mut header = vec![0u8; metaversion.len() + dataset_name.len()];
        header[..metaversion.len()].copy_from_slice(&metaversion);
        header[metaversion.len()..].copy_from_slice(dataset_name.as_bytes());
        let dataset_size = dataset
            .data
            .as_ref()
            .map(|data| data.len())
            .unwrap_or_default();

        let mut memory =
            Memory::from_sizes(experiment_id, 0, header.len(), 0, dataset_size, false)?;
        let change = memory.set_header(&header)?;
        debug_assert!(!change.resized() && !change.shifted());

        let buffer = memory.get_mut_data_buffer()?;
        buffer.copy_from_slice(
            dataset
                .data
                .as_ref()
                .map(|data| data.as_bytes())
                .unwrap_or_default(),
        );

        Ok(Self {
            segment: Segment::from_memory(memory),
        })
    }

    /// Contents of the dataset, e.g. a JSON or CSV string.
    ///
    /// # Panics
    ///
    /// If the dataset batch was created incorrectly or somehow overwritten (even though the batch
    /// isn't supposed to be changed after creation), then it might not have a data buffer.
    pub fn data(&self) -> &[u8] {
        self.segment
            .memory()
            .get_data_buffer()
            .expect("Dataset segment must have data buffer")
    }
}
