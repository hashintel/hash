use crate::hash_types::state::AgentStateField;

// These are columns that are included in the schema even if the user opts out

pub const REQUIRED: [AgentStateField; 7] = [
    AgentStateField::AgentId,
    AgentStateField::AgentName,
    AgentStateField::Behaviors,
    AgentStateField::Position,
    AgentStateField::Direction,
    AgentStateField::SearchRadius,
    AgentStateField::PositionWasCorrected,
];

pub trait IsRequired {
    fn is_required(&self) -> bool;
}

impl IsRequired for AgentStateField {
    fn is_required(&self) -> bool {
        REQUIRED.contains(self)
    }
}
