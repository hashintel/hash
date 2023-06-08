use stateful::field::{
    FieldScope, FieldType, FieldTypeVariant, FieldTypeVariant::FixedLengthArray, PresetFieldType,
    RootFieldSpec, RootFieldSpecCreator,
};

use crate::{package::simulation::context::neighbors::NEIGHBOR_INDEX_COUNT, Result};

pub(super) const NEIGHBORS_FIELD_NAME: &str = "neighbors";
pub(super) const SEARCH_RADIUS_FIELD_NAME: &str = "search_radius";

fn neighbors() -> FieldType {
    let variant = FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
        FixedLengthArray {
            field_type: Box::new(FieldType::new(
                FieldTypeVariant::Preset(PresetFieldType::Uint32),
                false,
            )),
            len: NEIGHBOR_INDEX_COUNT,
        },
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn get_neighbors_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let neighbors = neighbors();
    Ok(field_spec_creator.create("neighbors".into(), neighbors, FieldScope::Agent))
}

pub(super) fn get_search_radius_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let search_radius = FieldType::new(FieldTypeVariant::Number, true);
    Ok(field_spec_creator.create(
        SEARCH_RADIUS_FIELD_NAME.to_string(),
        search_radius,
        FieldScope::Agent,
    ))
}
