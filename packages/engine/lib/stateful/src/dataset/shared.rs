use core::fmt;

use serde::{Deserialize, Serialize};

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
