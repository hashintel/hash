use stateful::field::{
    FieldScope, FieldSpec, FieldType, FieldTypeVariant, RootFieldSpec, RootFieldSpecCreator,
};

use crate::Result;

pub(super) const FROM_FIELD_NAME: &str = "from";
pub(super) const TYPE_FIELD_NAME: &str = "type";
pub(super) const DATA_FIELD_NAME: &str = "data";
pub(super) const API_RESPONSES_FIELD_NAME: &str = "api_responses";

pub fn api_response_fields() -> Vec<FieldSpec> {
    vec![
        FieldSpec {
            name: FROM_FIELD_NAME.into(),
            field_type: FieldType::new(FieldTypeVariant::String, false),
        },
        FieldSpec {
            name: TYPE_FIELD_NAME.into(),
            field_type: FieldType::new(FieldTypeVariant::String, false),
        },
        FieldSpec {
            name: DATA_FIELD_NAME.into(),
            field_type: FieldType::new(FieldTypeVariant::String, true),
        },
    ]
}

fn api_responses() -> FieldType {
    let variant = FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
        FieldTypeVariant::Struct(api_response_fields()),
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn get_api_responses_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let api_responses = api_responses();
    Ok(field_spec_creator.create(
        API_RESPONSES_FIELD_NAME.into(),
        api_responses,
        FieldScope::Hidden,
    ))
}
