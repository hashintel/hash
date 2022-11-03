use std::{collections::HashMap, sync::Arc};

use arrow2::array::UInt32Array;

use super::{state::StateSnapshot, Error, Result, SimSchema};
use crate::datastore::batch::{AgentBatch, MessageBatch};

#[derive(new)]
pub struct Neighbor<'c> {
    // `col_indices`, `loc` and `snapshot` have to be public due to impl in accessors macro.
    // TODO: Just `&'c AgentContext` instead to minimize Neighbor size in memory?
    schema: &'c SimSchema,
    pub snapshot: &'c StateSnapshot,
    pub col_indices: &'c HashMap<String, usize>,
    pub loc: &'c UInt32Array, // i_group, i_neighbor_in_group
}

impl<'c> Neighbor<'c> {
    pub fn get_custom_as_json(&self, name: &str) -> Result<serde_json::Value> {
        if name == "messages" {
            return Err(Error::NotCustomField(name.to_string()));
        }

        if let Some((i_field, field)) = self.schema.agent.column_with_name(name) {
            // TODO: We removed this and similar methods as part of PR #361. If needs be we can 
            //   reintroduce the code by copying it back in. But we should explore other methods that are
            //   less involved. We've updated Arrow significantly since the code was written so there are 
            //   likely other utilities that will help us. For instance these methods might help:
            //   https://docs.rs/arrow/latest/arrow/json/index.html
            crate::datastore::arrow::element_conversion::col_element_to_json_val(
                self.agent_batch.column(i_field),
                self.index_in_group,
                field.data_type(),
            )
            .map_err(|e| Error::from(e.to_string()))
        } else {
            Err(Error::UnknownAgentField(name.to_string()))
        }
    }

    /// Get a custom value, or return the provided default if the field does not exist.
    pub fn get_custom_or<T>(&self, name: &str, default: T) -> Result<T>
    where
        for<'de> T: serde::Deserialize<'de>,
    {
        self.get_custom_as_json(name)
            .and_then(|v| serde_json::from_value::<T>(v).map_err(Error::from))
            .or_else(|e| match e {
                Error::UnknownAgentField(_) => Ok(default),
                _ => Err(e),
            })
    }
}
