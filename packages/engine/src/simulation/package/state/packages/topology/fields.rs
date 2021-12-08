use crate::datastore::schema::RootFieldSpec;
use crate::{
    datastore::schema::{FieldScope, FieldType, FieldTypeVariant as FTV, RootFieldSpecCreator},
    simulation::Result,
};

pub(super) fn get_pos_corrected_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(FTV::Boolean, false);
    Ok(field_spec_creator.create(
        "position_was_corrected".into(),
        field_type,
        FieldScope::Agent,
    ))
}
