use alloc::sync::Arc;
use core::cmp;
use std::collections::{HashMap, hash_map::Entry};

use serde::{Deserialize, Serialize};

use crate::{
    Valid,
    schema::{DataType, DataTypeId, data_type::DataTypeEdge},
    url::VersionedUrl,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
// #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
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
pub struct DataTypeInheritanceData {
    pub inheritance_depths: HashMap<DataTypeId, u32>,
}

impl DataTypeInheritanceData {
    pub fn add_edge(&mut self, edge: DataTypeEdge, target: DataTypeId, depth: u32) {
        match edge {
            DataTypeEdge::Inheritance => match self.inheritance_depths.entry(target) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = cmp::min(depth, *entry.get());
                }
                Entry::Vacant(entry) => {
                    entry.insert(depth);
                }
            },
        }
    }
}
