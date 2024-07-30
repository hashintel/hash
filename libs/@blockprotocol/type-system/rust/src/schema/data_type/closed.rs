use alloc::sync::Arc;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{schema::DataType, url::VersionedUrl};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
pub struct ClosedDataType {
    #[serde(flatten)]
    pub schema: Arc<DataType>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty", rename = "$defs")]
    pub definitions: HashMap<VersionedUrl, Arc<DataType>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClosedDataTypeMetadata {
    pub inheritance_depths: HashMap<VersionedUrl, u32>,
}
