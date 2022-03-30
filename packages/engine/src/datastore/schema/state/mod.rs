mod message;

use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;
use storage::meta::{self, conversion::HashStaticMeta};

pub use self::message::MessageSchema;
use crate::datastore::{error::Result, schema::FieldSpecMap};

/// `AgentSchema` describes the layout of every
/// agent-containing `SharedBatch` in a datastore. It contains
/// the dual representation of both the
/// field_spec and the Arrow schema.
#[derive(Clone, Debug)]
pub struct AgentSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<meta::Static>,
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
}
