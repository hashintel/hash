// These are columns that are included in the schema even if the user opts out

use stateful::agent::AgentStateField;

pub const REQUIRED: [AgentStateField; 4] = [
    AgentStateField::AgentId,
    AgentStateField::AgentName,
    AgentStateField::Position,
    AgentStateField::Direction,
];

pub trait IsRequired {
    fn is_required(&self) -> bool;
}

impl IsRequired for AgentStateField {
    fn is_required(&self) -> bool {
        REQUIRED.contains(self)
    }
}
