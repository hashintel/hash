use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;
use stateful::field::FieldSpecMap;

use crate::datastore::{error::Result, schema::EngineComponent};

pub struct ContextSchema {
    pub arrow: Arc<ArrowSchema>,
    pub field_spec_map: Arc<FieldSpecMap<EngineComponent>>,
}

impl ContextSchema {
    pub fn new(field_spec_map: FieldSpecMap<EngineComponent>) -> Result<ContextSchema> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);

        Ok(ContextSchema {
            arrow: arrow_schema,
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
