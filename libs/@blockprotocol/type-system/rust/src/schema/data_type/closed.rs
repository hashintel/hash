use alloc::sync::Arc;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{schema::DataType, url::VersionedUrl, Valid};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
pub struct ClosedDataType {
    #[serde(flatten)]
    pub schema: Arc<DataType>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty", rename = "$defs")]
    pub definitions: HashMap<VersionedUrl, Arc<DataType>>,
}

impl ClosedDataType {
    #[must_use]
    pub fn data_type(&self) -> &Valid<DataType> {
        // Valid closed schemas imply that the schema is valid
        Valid::new_ref_unchecked(&self.schema)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClosedDataTypeMetadata {
    pub inheritance_depths: HashMap<VersionedUrl, u32>,
}
