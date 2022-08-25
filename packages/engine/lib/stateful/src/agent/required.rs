// These are columns that are included in the schema even if the user opts out

use crate::agent::AgentStateField;

const REQUIRED: [AgentStateField; 4] = [
    AgentStateField::AgentId,
    AgentStateField::AgentName,
    AgentStateField::Position,
    AgentStateField::Direction,
];

pub(crate) trait IsRequired {
    fn is_required(&self) -> bool;
}

impl IsRequired for AgentStateField {
    fn is_required(&self) -> bool {
        REQUIRED.contains(self)
    }
}
