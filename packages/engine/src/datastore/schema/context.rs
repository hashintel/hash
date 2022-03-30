use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;

use crate::datastore::{error::Result, schema::field_spec::FieldSpecMap};

pub struct ContextSchema {
    pub arrow: Arc<ArrowSchema>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl ContextSchema {
    pub fn new(field_spec_map: FieldSpecMap) -> Result<ContextSchema> {
        let arrow_schema = Arc::new(field_spec_map.get_arrow_schema()?);

        Ok(ContextSchema {
            arrow: arrow_schema,
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
