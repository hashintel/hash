mod message;

use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;
use memory::arrow::meta::{self, conversion::HashStaticMeta};
use stateful::field::{FieldSource, FieldSpecMap};

pub use self::message::MessageSchema;
use crate::datastore::error::Result;

/// `AgentSchema` describes the layout of every
/// agent-containing `SharedBatch` in a datastore. It contains
/// the dual representation of both the
/// field_spec and the Arrow schema.
#[derive(Clone, Debug)]
pub struct AgentSchema<S> {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<meta::Static>,
    pub field_spec_map: Arc<FieldSpecMap<S>>,
}

impl<S: FieldSource + Clone> AgentSchema<S> {
    pub fn new(field_spec_map: FieldSpecMap<S>) -> Result<Self> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);
        let static_meta = arrow_schema.get_static_metadata();

        Ok(Self {
            arrow: arrow_schema,
            static_meta: Arc::new(static_meta),
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
