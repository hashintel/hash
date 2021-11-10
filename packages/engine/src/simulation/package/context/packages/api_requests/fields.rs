use crate::datastore::schema::{FieldScope, FieldType, FieldTypeVariant::*};

use super::*;

fn api_response_fields() -> Vec<FieldSpec> {
    vec![
        FieldSpec::new("from".into(), FieldType::new(String, false)),
        FieldSpec::new("type".into(), FieldType::new(String, false)),
        FieldSpec::new("data".into(), FieldType::new(String, true)),
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
    let api_responses = api_responses();
    field_spec_map_builder.add_field_spec(
        "api_responses".into(),
        api_responses,
        FieldScope::Hidden,
    )?;
    Ok(())
}
