// TODO: Expand unit tests to cover more cases, such as the AgentScopedFieldKeyClash branch, and
//   possibly split across modules

use stateful::{
    agent::AgentStateField,
    field::{
        FieldScope, FieldSource, FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant,
        RootFieldSpec, RootFieldSpecCreator,
    },
    Error, Result,
};

use crate::tests::test_utils::root_field_spec_from_agent_field;

#[test]
fn name_collision_built_in() {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();

    field_spec_map
        .try_extend(RootFieldSpec::base_agent_fields().unwrap())
        .unwrap();

    let err = field_spec_map
        .try_extend([field_spec_creator.create(
            "agent_id".to_string(),
            FieldType::new(FieldTypeVariant::Number, true),
            FieldScope::Agent,
        )])
        .unwrap_err();
    assert!(matches!(err, Error::FieldKeyClash(..)));
}

#[test]
fn name_collision_custom() {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();

    field_spec_map
        .try_extend(RootFieldSpec::base_agent_fields().unwrap())
        .unwrap();

    field_spec_map
        .try_extend([field_spec_creator.create(
            "test".to_string(),
            FieldType::new(FieldTypeVariant::String, false),
            FieldScope::Private,
        )])
        .unwrap();

    let err = field_spec_map
        .try_extend([field_spec_creator.create(
            "test".to_string(),
            FieldType::new(FieldTypeVariant::String, true),
            FieldScope::Private,
        )])
        .unwrap_err();
    assert!(matches!(err, Error::FieldKeyClash(..)));
}

#[test]
fn unchanged_size_built_in() {
    let _field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();

    field_spec_map
        .try_extend(RootFieldSpec::base_agent_fields().unwrap())
        .unwrap();

    let len_before = field_spec_map.len();

    field_spec_map
        .try_extend([root_field_spec_from_agent_field(AgentStateField::AgentId).unwrap()])
        .unwrap();

    assert_eq!(len_before, field_spec_map.len());
}

#[test]
fn unchanged_size_custom() {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();

    field_spec_map
        .try_extend([field_spec_creator.create(
            "test".to_string(),
            FieldType::new(FieldTypeVariant::String, false),
            FieldScope::Agent,
        )])
        .unwrap();
    field_spec_map
        .try_extend([field_spec_creator.create(
            "test".to_string(),
            FieldType::new(FieldTypeVariant::String, false),
            FieldScope::Agent,
        )])
        .unwrap();
    field_spec_map
        .try_extend([field_spec_creator.create(
            "test".to_string(),
            FieldType::new(FieldTypeVariant::String, false),
            FieldScope::Agent,
        )])
        .unwrap();

    assert_eq!(field_spec_map.len(), 1);
}

#[test]
pub fn test_struct_types_enabled() -> Result<()> {
    let mut keys = FieldSpecMap::default();
    keys.try_extend([RootFieldSpec {
        inner: FieldSpec {
            name: "struct".to_string(),
            field_type: FieldType::new(
                FieldTypeVariant::Struct(vec![
                    FieldSpec {
                        name: "first_column".to_string(),
                        field_type: FieldType::new(FieldTypeVariant::Number, false),
                    },
                    FieldSpec {
                        name: "second_column".to_string(),
                        field_type: FieldType::new(FieldTypeVariant::Boolean, true),
                    },
                ]),
                true,
            ),
        },
        scope: FieldScope::Private,
        source: FieldSource::Engine,
    }])?;

    keys.create_arrow_schema()?;
    Ok(())
}
