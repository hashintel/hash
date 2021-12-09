use super::*;
use crate::datastore::schema::{FieldScope, FieldType, FieldTypeVariant::*};

pub fn api_response_fields() -> Vec<FieldSpec> {
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

pub(super) fn get_api_responses_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let api_responses = api_responses();
    Ok(field_spec_creator.create("api_responses".into(), api_responses, FieldScope::Hidden))
}
