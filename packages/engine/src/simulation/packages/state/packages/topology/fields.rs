use crate::{
    datastore::schema::{FieldScope, FieldSpecMapBuilder, FieldType, FieldTypeVariant as FTV},
    simulation::Result,
};

pub(super) fn add_state(builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let field_type = FieldType::new(FTV::Boolean, false);
    builder.add_field_spec(
        "position_was_corrected".into(),
        field_type,
        FieldScope::Agent,
    )?;
    Ok(())
}
