use stateful::field::{FieldScope, FieldType, FieldTypeVariant};

use crate::{
    datastore::schema::{EngineComponent, RootFieldSpec, RootFieldSpecCreator},
    simulation::Result,
};

pub(super) fn get_pos_corrected_field_spec(
    field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
) -> Result<RootFieldSpec<EngineComponent>> {
    let field_type = FieldType::new(FieldTypeVariant::Boolean, false);
    Ok(field_spec_creator.create(
        "position_was_corrected".into(),
        field_type,
        FieldScope::Agent,
    ))
}
