mod message;

use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;
use memory::arrow::meta::{self, conversion::HashStaticMeta};
use stateful::field::FieldSpecMap;

pub use self::message::MessageSchema;
use crate::datastore::{error::Result, schema::EngineComponent};

/// `AgentSchema` describes the layout of every
/// agent-containing `SharedBatch` in a datastore. It contains
/// the dual representation of both the
/// field_spec and the Arrow schema.
#[derive(Clone, Debug)]
pub struct AgentSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<meta::Static>,
    pub field_spec_map: Arc<FieldSpecMap<EngineComponent>>,
}

impl AgentSchema {
    pub fn new(field_spec_map: FieldSpecMap<EngineComponent>) -> Result<AgentSchema> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);
        let static_meta = arrow_schema.get_static_metadata();

        Ok(AgentSchema {
            arrow: arrow_schema,
            static_meta: Arc::new(static_meta),
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
