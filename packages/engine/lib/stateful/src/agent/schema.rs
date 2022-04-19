use std::sync::Arc;

use arrow::datatypes::Schema;
use memory::arrow::{meta, meta::conversion::HashStaticMeta};

use crate::{error::Result, field::FieldSpecMap};

/// Describes the memory format for every [`Agent`]-containing [`AgentBatch`].
///
/// It contains the dual representation of both the [`FieldSpec`] and the Arrow schema.
///
/// [`Agent`]: crate::agent::Agent
/// [`FieldSpec`]: crate::field::FieldSpec
#[derive(Clone, Debug)]
pub struct AgentSchema {
    pub arrow: Arc<Schema>,
    pub static_meta: Arc<meta::Static>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl AgentSchema {
    pub fn new(field_spec_map: FieldSpecMap) -> Result<Self> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);
        let static_meta = arrow_schema.get_static_metadata();

        Ok(Self {
            arrow: arrow_schema,
            static_meta: Arc::new(static_meta),
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
