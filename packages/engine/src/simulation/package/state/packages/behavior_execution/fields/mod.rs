pub mod behavior;

use std::convert::TryInto;

use behavior::add_fields_from_behavior_keys;

use arrow::datatypes::DataType;

use self::behavior::BehaviorMap;

use super::BEHAVIOR_INDEX_INNER_COUNT;

use crate::config::ExperimentConfig;
use crate::datastore::schema::{
    FieldScope, FieldSpecMapBuilder, FieldType, FieldTypeVariant as FTV, PresetFieldType,
};
use crate::simulation::Result;

fn add_behaviors(builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let field_type = FieldType::new(
        FTV::VariableLengthArray(Box::new(FieldType::new(FTV::String, false))),
        false,
    );
    builder.add_field_spec("behaviors".into(), field_type, FieldScope::Agent)?;
    Ok(())
}

fn add_behavior_index(builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let field_type = FieldType::new(FTV::Number, false);
    builder.add_field_spec("behavior_index".into(), field_type, FieldScope::Agent)?;
    Ok(())
}

fn behavior_id_inner_field_type() -> FieldType {
    FieldType::new(FTV::Preset(PresetFieldType::UInt16), false)
}

fn behavior_id_field_type() -> FieldType {
    FieldType::new(
        FTV::FixedLengthArray {
            kind: Box::new(behavior_id_inner_field_type()),
            len: BEHAVIOR_INDEX_INNER_COUNT,
        },
        false,
    )
}

fn behavior_ids_field_type() -> FieldType {
    let variant = FTV::VariableLengthArray(Box::new(behavior_id_field_type()));
    FieldType::new(variant, false)
}

fn add_hidden_behavior_ids(builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let field_type = behavior_ids_field_type();
    builder.add_field_spec("behavior_ids".into(), field_type, FieldScope::Private)?;
    Ok(())
}

pub(super) fn add_state(
    config: &ExperimentConfig,
    builder: &mut FieldSpecMapBuilder,
) -> Result<()> {
    // "behaviors" field that agents can modify
    add_behaviors(builder)?;
    add_behavior_index(builder)?;
    // "behaviors_indices" field that is hidden,
    // but the way behavior execution keeps track
    // of the behavior chain for a single step
    add_hidden_behavior_ids(builder)?;
    let behavior_map: BehaviorMap = config.try_into()?;
    add_fields_from_behavior_keys(builder, behavior_map.all_field_specs)?;
    Ok(())
}

pub(super) fn index_column_data_types() -> Result<[DataType; 3]> {
    let data_type_1 = behavior_ids_field_type().get_arrow_data_type()?;
    let data_type_2 = behavior_id_field_type().get_arrow_data_type()?;
    let data_type_3 = behavior_id_inner_field_type().get_arrow_data_type()?;
    Ok([data_type_1, data_type_2, data_type_3])
}
