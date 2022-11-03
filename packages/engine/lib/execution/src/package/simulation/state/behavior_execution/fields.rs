use arrow2::datatypes::DataType;
use stateful::field::{
    FieldScope, FieldType, FieldTypeVariant, PresetFieldType, RootFieldSpec, RootFieldSpecCreator,
};

use crate::{
    package::simulation::{
        state::behavior_execution::{BehaviorMap, BEHAVIOR_INDEX_INNER_COUNT},
        PackageInitConfig,
    },
    Result,
};

pub(super) const BEHAVIORS_FIELD_NAME: &str = "behaviors";
pub(super) const BEHAVIOR_INDEX_FIELD_NAME: &str = "behavior_index";
pub(super) const BEHAVIOR_IDS_FIELD_NAME: &str = "behavior_ids";

fn get_behaviors_field_spec(field_spec_creator: &RootFieldSpecCreator) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(
        FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
            FieldTypeVariant::String,
            false,
        ))),
        false,
    );
    Ok(field_spec_creator.create(BEHAVIORS_FIELD_NAME.into(), field_type, FieldScope::Agent))
}

fn get_behavior_index_field_spec(
    field_spec_creator: &RootFieldSpecCreator,
) -> Result<RootFieldSpec> {
    let field_type = FieldType::new(FieldTypeVariant::Number, false);
    Ok(field_spec_creator.create(
        BEHAVIOR_INDEX_FIELD_NAME.into(),
        field_type,
        FieldScope::Private,
    ))
}

fn behavior_id_inner_field_type() -> FieldType {
    FieldType::new(FieldTypeVariant::Preset(PresetFieldType::Uint16), false)
}

fn behavior_id_field_type() -> FieldType {
    FieldType::new(
        FieldTypeVariant::FixedLengthArray {
            field_type: Box::new(behavior_id_inner_field_type()),
            len: BEHAVIOR_INDEX_INNER_COUNT,
        },
        false,
    )
}

fn behavior_ids_field_type() -> FieldType {
    let variant = FieldTypeVariant::VariableLengthArray(Box::new(behavior_id_field_type()));
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
    config: &PackageInitConfig,
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

pub(super) fn id_column_data_types() -> [DataType; 3] {
    let data_type_1 = DataType::from(behavior_ids_field_type().variant);
    let data_type_2 = DataType::from(behavior_id_field_type().variant);
    let data_type_3 = DataType::from(behavior_id_inner_field_type().variant);
    [data_type_1, data_type_2, data_type_3]
}
