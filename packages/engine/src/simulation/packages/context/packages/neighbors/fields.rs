use super::*;
use crate::datastore::schema::{FieldScope, FieldType, FieldTypeVariant::*, PresetFieldType};
use crate::simulation::packages::prelude::ArrowDataType;

fn neighbors() -> FieldType {
    let variant = VariableLengthArray(Box::new(FieldType::new(
        FixedLengthArray {
            kind: Box::new(FieldType::new(
                Preset(PresetFieldType::Arrow(ArrowDataType::UInt32)),
                false,
            )),
            len: NEIGHBOR_INDEX_COUNT,
        },
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn add_context(field_spec_map_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let neighbors = neighbors();
    field_spec_map_builder.add_field_spec("neighbors".into(), neighbors, FieldScope::Hidden)?;
    Ok(())
}

pub(super) fn add_state(field_spec_map_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let search_radius = FieldType::new(Number, true);
    field_spec_map_builder.add_field_spec(
        "search_radius".to_string(),
        search_radius,
        FieldScope::Agent,
    )?;
    Ok(())
}
