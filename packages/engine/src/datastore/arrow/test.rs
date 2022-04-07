use std::collections::HashMap;

use arrow::datatypes::{DataType, Field, Schema};
use stateful::{
    agent::AgentStateField,
    field::{
        EngineComponent, FieldScope, FieldSpecMap, FieldType, FieldTypeVariant,
        RootFieldSpecCreator,
    },
};

use crate::datastore::{error::Result, test_utils::root_field_spec_from_agent_field};

#[test]
fn get_schema() -> Result<()> {
    let field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
    let mut field_spec_map = FieldSpecMap::empty();

    field_spec_map.try_extend([field_spec_creator.create(
        "test1".to_string(),
        FieldType::new(FieldTypeVariant::Boolean, true),
        FieldScope::Private,
    )])?;

    field_spec_map.try_extend([field_spec_creator.create(
        "test2".to_string(),
        FieldType::new(
            FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
                FieldTypeVariant::Number,
                false,
            ))),
            true,
        ),
        FieldScope::Private,
    )])?;

    field_spec_map.try_extend([field_spec_creator.create(
        "test3".to_string(),
        FieldType::new(
            FieldTypeVariant::FixedLengthArray {
                field_type: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
                len: 3,
            },
            true,
        ),
        FieldScope::Private,
    )])?;

    field_spec_map.try_extend([root_field_spec_from_agent_field(AgentStateField::AgentId)?])?;

    let mut meta = HashMap::new();
    meta.insert("any_type_fields".into(), "".into());
    meta.insert("nullable".into(), "1,1,0,1".into());
    let target = Schema::new_with_metadata(
        vec![
            Field::new("_PRIVATE_0_test1", DataType::Boolean, true),
            Field::new(
                "_PRIVATE_0_test3",
                DataType::FixedSizeList(Box::new(Field::new("item", DataType::Float64, true)), 3),
                true,
            ),
            Field::new(
                "agent_id",
                DataType::FixedSizeBinary(crate::datastore::UUID_V4_LEN as i32),
                false,
            ),
            Field::new(
                "_PRIVATE_0_test2",
                DataType::List(Box::new(Field::new("item", DataType::Float64, true))),
                true,
            ),
        ],
        meta,
    );

    let schema = field_spec_map.create_arrow_schema().unwrap();
    assert_eq!(schema, target);
    Ok(())
}
