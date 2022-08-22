use std::collections::BTreeMap;

use arrow2::datatypes::{DataType, Field, Schema};
use stateful::{
    agent::{
        arrow::{IntoRecordBatch, PREVIOUS_INDEX_FIELD_KEY},
        AgentStateField, IntoAgents,
    },
    field::{
        FieldScope, FieldSource, FieldSpecMap, FieldType, FieldTypeVariant, RootFieldSpecCreator,
        UUID_V4_LEN,
    },
    message::MessageSchema,
};

use crate::{
    command::Result,
    tests::test_utils::{gen_schema_and_test_agents, root_field_spec_from_agent_field},
};

#[test]
fn get_schema() -> Result<()> {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
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

    let mut meta = BTreeMap::new();
    meta.insert("any_type_fields".into(), "".into());
    meta.insert("nullable".into(), "1,1,0,1".into());
    let target = Schema::from(vec![
        Field::new("_PRIVATE_0_test1", DataType::Boolean, true),
        Field::new(
            "_PRIVATE_0_test3",
            DataType::FixedSizeList(Box::new(Field::new("item", DataType::Float64, true)), 3),
            true,
        ),
        Field::new("agent_id", DataType::FixedSizeBinary(UUID_V4_LEN), false),
        Field::new(
            "_PRIVATE_0_test2",
            DataType::List(Box::new(Field::new("item", DataType::Float64, true))),
            true,
        ),
    ])
    .with_metadata(meta);

    let schema = field_spec_map.create_arrow_schema().unwrap();
    assert_eq!(schema, target);
    Ok(())
}

#[test]
#[cfg_attr(miri, ignore)]
fn agent_state_into_record_batch() -> Result<()> {
    let mut failed_agent_seeds = vec![];

    for round in 0..3 {
        let num_agents = 150;
        let initial_seed = round * num_agents;
        let (schema, mut agents) = gen_schema_and_test_agents(num_agents, initial_seed as u64)?;

        let agent_batch = agents.as_slice().to_agent_batch(&schema)?;
        let message_batch = agents
            .as_slice()
            .to_message_batch(MessageSchema::default().arrow)?;

        let mut returned_agents = (&agent_batch, &message_batch).to_agent_states(Some(&schema))?;

        agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        returned_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });

        agents
            .iter()
            .zip(returned_agents.iter())
            .for_each(|(agent, returned_agent)| {
                if agent != returned_agent {
                    failed_agent_seeds.push(agent.get_custom::<f64>("seed").unwrap())
                }
            });
    }

    assert_eq!(
        failed_agent_seeds.len(),
        0,
        "Some agents failed to be properly converted, their seeds were: {:?}",
        failed_agent_seeds
    );

    Ok(())
}
