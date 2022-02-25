mod message;

use std::sync::Arc;

pub use message::MessageSchema;

use super::FieldSpecMap;
use crate::datastore::prelude::*;

/// `AgentSchema` describes the layout of every
/// agent-containing `SharedBatch` in a datastore. It contains
/// the dual representation of both the
/// field_spec and the Arrow schema.
#[derive(Clone, Debug)]
pub struct AgentSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<StaticMeta>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl AgentSchema {
    pub fn new(field_spec_map: FieldSpecMap) -> Result<AgentSchema> {
        let arrow_schema = Arc::new(field_spec_map.get_arrow_schema()?);
        let static_meta = arrow_schema.get_static_metadata();

        Ok(AgentSchema {
            arrow: arrow_schema,
            static_meta: Arc::new(static_meta),
            field_spec_map: Arc::new(field_spec_map),
        })
    }

    // TODO: unused?
    pub fn column_index_of(&self, name: &str) -> Result<usize> {
        let index = self.arrow.index_of(name)?;
        Ok(index)
    }
}
