use stateful::field::{FieldScope, FieldType, FieldTypeVariant, PresetFieldType};

use crate::{
    datastore::schema::{EngineComponent, RootFieldSpec},
    simulation::package::context::packages::agent_messages::{
        Result, RootFieldSpecCreator, MESSAGE_INDEX_COUNT,
    },
};

pub(super) const MESSAGES_FIELD_NAME: &str = "messages";

fn agent_messages() -> FieldType {
    let variant = FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
        FieldTypeVariant::FixedLengthArray {
            field_type: Box::new(FieldType::new(
                FieldTypeVariant::Preset(PresetFieldType::Uint32),
                false,
            )),
            len: MESSAGE_INDEX_COUNT,
        },
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn get_messages_field_spec(
    field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
) -> Result<RootFieldSpec<EngineComponent>> {
    let agent_messages = agent_messages();
    // The messages column can be agent-scoped because it
    // has custom getters in the language runners that
    // return the actual messages that the agent received,
    // not just their indices.
    Ok(field_spec_creator.create(
        MESSAGES_FIELD_NAME.into(),
        agent_messages,
        FieldScope::Agent,
    ))
}
