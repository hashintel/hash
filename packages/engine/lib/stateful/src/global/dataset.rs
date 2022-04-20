use core::fmt;

use memory::shared_memory::{MemoryId, Metaversion, Segment};
use serde::{Deserialize, Serialize};

use crate::Result;

/// Represents arbitrary data plainly stored in [`memory`].
///
/// For a high-level concept of datasets, please see the [HASH documentation].
///
/// In comparison to [`Globals`], a [`Dataset`] is stored in a memory [`Segment`] and can be
/// constructed from a [`SharedDataset`]. Its data can be accessed by [`data()`].
///
/// [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/datasets
/// [`Globals`]: crate::global::Globals
/// [`Segment`]: memory::shared_memory::Segment
/// [`data()`]: Self::data
pub struct Dataset {
    segment: Segment,
}

impl Dataset {
    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    pub fn from_shared(dataset: &SharedDataset, memory_id: MemoryId) -> Result<Self> {
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

        let mut segment = Segment::from_sizes(memory_id, 0, header.len(), 0, dataset_size, false)?;
        let change = segment.set_header(&header)?;
        debug_assert!(!change.resized() && !change.shifted());

        let buffer = segment.get_mut_data_buffer()?;
        buffer.copy_from_slice(
            dataset
                .data
                .as_ref()
                .map(|data| data.as_bytes())
                .unwrap_or_default(),
        );

        Ok(Self { segment })
    }

    /// Contents of the dataset, e.g. a JSON or CSV string.
    ///
    /// # Panics
    ///
    /// If the dataset batch was created incorrectly or somehow overwritten (even though the batch
    /// isn't supposed to be changed after creation), then it might not have a data buffer.
    pub fn data(&self) -> &[u8] {
        self.segment
            .get_data_buffer()
            .expect("Dataset segment must have data buffer")
    }
}

/// Record for a [`Dataset`] pointing to a file.
///
/// A `SharedDataset` can either be stored as JSON or as CSV.
#[derive(Deserialize, Serialize, Clone)]
pub struct SharedDataset {
    pub name: Option<String>,
    pub shortname: String,
    pub filename: String,
    pub url: Option<String>,
    /// Whether the downloadable dataset is a csv
    pub raw_csv: bool,
    pub data: Option<String>,
}

impl fmt::Debug for SharedDataset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SharedDataset")
            .field("name", &self.name)
            .field("shortname", &self.shortname)
            .field("filename", &self.filename)
            .field("url", &self.url)
            .field("raw_csv", &self.raw_csv)
            .field(
                "data",
                if self.data.is_some() {
                    &"Some(...)"
                } else {
                    &"None"
                },
            )
            .finish()
    }
}
