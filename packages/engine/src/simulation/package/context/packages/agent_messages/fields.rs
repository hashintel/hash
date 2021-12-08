use crate::datastore::schema::{FieldScope, FieldType, FieldTypeVariant::*, PresetFieldType};

use super::*;

fn agent_messages() -> FieldType {
    let variant = VariableLengthArray(Box::new(FieldType::new(
        FixedLengthArray {
            kind: Box::new(FieldType::new(Preset(PresetFieldType::UInt32), false)),
            len: MESSAGE_INDEX_COUNT,
        },
        false,
    )));
    FieldType::new(variant, false)
}

pub(super) fn add_context(field_spec_map_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    let agent_messages = agent_messages();
    // The messages column can be agent-scoped because it
    // has custom getters in the language runners that
    // return the actual messages that the agent received,
    // not just their indices.
    field_spec_map_builder.add_field_spec("messages".into(), agent_messages, FieldScope::Agent)?;
    Ok(())
}
