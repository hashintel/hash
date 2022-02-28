use std::sync::Arc;

use crate::datastore::{prelude::*, schema::field_spec::FieldSpecMap};

pub struct ContextSchema {
    pub arrow: Arc<ArrowSchema>,
    // TODO: UNUSED: Needs triage
    pub static_meta: Arc<StaticMeta>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl ContextSchema {
    pub fn new(field_spec_map: FieldSpecMap) -> Result<ContextSchema> {
        let arrow_schema = Arc::new(field_spec_map.get_arrow_schema()?);
        let static_meta = arrow_schema.get_static_metadata();

        Ok(ContextSchema {
            arrow: arrow_schema,
            static_meta: Arc::new(static_meta),
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
