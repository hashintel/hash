use stateful::field::{
    FieldScope, FieldType, FieldTypeVariant, RootFieldSpec, RootFieldSpecCreator,
};

use crate::Result;

pub(super) fn get_pos_corrected_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(FieldTypeVariant::Boolean, false);
    Ok(field_spec_creator.create(
        "position_was_corrected".into(),
        field_type,
        FieldScope::Agent,
    ))
}
