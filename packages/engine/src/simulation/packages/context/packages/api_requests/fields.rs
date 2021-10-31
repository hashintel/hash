use crate::datastore::schema::{FieldScope, FieldType, FieldTypeVariant::*};

use super::*;

fn api_response_fields() -> Vec<FieldSpec> {
    vec![
        FieldSpec::new("from", FieldType::new(String, false)),
        FieldSpec::new("type", FieldType::new(String, false)),
        FieldSpec::new("data", FieldType::new(String, true)),
    ]
}

fn api_responses() -> FieldType {
    let variant = VariableLengthArray(Box::new(FieldType::new(
        Struct(api_response_fields()),
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn api_response_arrow_fields() -> Result<Vec<arrow::datatypes::Field>> {
    let fields = api_response_fields()
        .into_iter()
        .map(|key| key.get_arrow_field())
        .collect::<crate::datastore::error::Result<_>>()?;
    Ok(fields)
}

pub(super) fn add_context(field_spec_map_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let neighbors = api_responses();
    field_spec_map_builder.add_field_spec("api_responses".into(), neighbors, FieldScope::Hidden)?;
    Ok(())
}
