use std::sync::Arc;

use arrow::datatypes::Schema;

use crate::{field::FieldSpecMap, Result};

pub struct ContextSchema {
    pub arrow: Arc<Schema>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl ContextSchema {
    pub fn new(field_spec_map: FieldSpecMap) -> Result<ContextSchema> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);

        Ok(ContextSchema {
            arrow: arrow_schema,
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
