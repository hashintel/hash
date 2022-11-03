use std::sync::Arc;

use arrow2::datatypes::Schema;

use crate::{field::FieldSpecMap, Result};

/// Describes the memory format used for storing the [`Context`].
///
/// It contains the dual representation of both the [`FieldSpec`] and the Arrow schema.
///
/// [`Context`]: crate::context::Context
/// [`FieldSpec`]: crate::field::FieldSpec
#[derive(Debug)]
pub struct ContextSchema {
    pub arrow: Arc<Schema>,
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl ContextSchema {
    /// Creates a new `ContextSchema` from the provided `field_spec_map`.
    pub fn new(field_spec_map: FieldSpecMap) -> Result<ContextSchema> {
        let arrow_schema = Arc::new(field_spec_map.create_arrow_schema()?);

        Ok(ContextSchema {
            arrow: arrow_schema,
            field_spec_map: Arc::new(field_spec_map),
        })
    }
}
