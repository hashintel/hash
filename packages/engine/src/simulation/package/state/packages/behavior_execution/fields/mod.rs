pub mod behavior;

use arrow::datatypes::DataType;

use self::behavior::BehaviorMap;
use crate::{
    config::ExperimentConfig,
    datastore::schema::{
        FieldScope, FieldType, FieldTypeVariant as FTV, PresetFieldType, RootFieldSpec,
        RootFieldSpecCreator,
    },
    simulation::{
        package::state::packages::behavior_execution::BEHAVIOR_INDEX_INNER_COUNT, Result,
    },
};

pub(super) const BEHAVIORS_FIELD_NAME: &str = "behaviors";
pub(super) const BEHAVIOR_INDEX_FIELD_NAME: &str = "behavior_index";
pub(super) const BEHAVIOR_IDS_FIELD_NAME: &str = "behavior_ids";

fn get_behaviors_field_spec(field_spec_creator: &RootFieldSpecCreator) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(
        FTV::VariableLengthArray(Box::new(FieldType::new(FTV::String, false))),
        false,
    );
    Ok(field_spec_creator.create(BEHAVIORS_FIELD_NAME.into(), field_type, FieldScope::Agent))
}

fn get_behavior_index_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(FTV::Number, false);
    Ok(field_spec_creator.create(
        BEHAVIOR_INDEX_FIELD_NAME.into(),
        field_type,
        FieldScope::Private,
    ))
}

fn behavior_id_inner_field_type() -> FieldType {
    FieldType::new(FTV::Preset(PresetFieldType::Uint16), false)
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

fn get_behavior_ids_field_spec(field_spec_creator: &RootFieldSpecCreator) -> Result<RootFieldSpec> {
    let field_type = behavior_ids_field_type();
    Ok(field_spec_creator.create(
        BEHAVIOR_IDS_FIELD_NAME.into(),
        field_type,
        FieldScope::Private,
    ))
}

pub(super) fn get_state_field_specs(
    config: &ExperimentConfig,
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<Vec<RootFieldSpec>> {
    let behavior_map: BehaviorMap = (config, field_spec_creator).try_into()?;
    let mut field_specs = vec![
        // "behaviors" field that agents can modify
        get_behaviors_field_spec(field_spec_creator)?,
        get_behavior_index_field_spec(field_spec_creator)?,
        // "behavior_ids" field that is private,
        // the way behavior execution keeps track
        // of the behavior chain for a single step
        get_behavior_ids_field_spec(field_spec_creator)?,
    ];

    field_specs.extend(behavior_map.all_field_specs.field_specs().cloned());
    Ok(field_specs)
}

pub(super) fn id_column_data_types() -> Result<[DataType; 3]> {
    let data_type_1 = behavior_ids_field_type().get_arrow_data_type()?;
    let data_type_2 = behavior_id_field_type().get_arrow_data_type()?;
    let data_type_3 = behavior_id_inner_field_type().get_arrow_data_type()?;
    Ok([data_type_1, data_type_2, data_type_3])
}
