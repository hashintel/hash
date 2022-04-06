use serde::de::{self, Deserialize, Deserializer, Visitor};

use crate::{
    field::{FieldType, FieldTypeVariant, PresetFieldType},
    Error,
};

/// The possible fields in an agent's state.
///
/// It's used in `batch`es to determine the type of a field stored in the corresponding `batch`.
#[derive(Eq, PartialEq, Hash, Debug, Clone)]
pub enum AgentStateField {
    AgentId,
    AgentName,
    Messages,
    Position,
    Direction,
    Velocity,
    Shape,
    Height,
    Scale,
    Color,
    Rgb,
    Hidden,

    /// Any custom, non-built-in field. Corresponds to [`Agent::custom`].
    Extra(String),
}

impl AgentStateField {
    pub const FIELDS: &'static [AgentStateField] = &[
        AgentStateField::AgentId,
        AgentStateField::AgentName,
        AgentStateField::Messages,
        AgentStateField::Position,
        AgentStateField::Direction,
        AgentStateField::Velocity,
        AgentStateField::Shape,
        AgentStateField::Height,
        AgentStateField::Scale,
        AgentStateField::Color,
        AgentStateField::Rgb,
        AgentStateField::Hidden,
    ];

    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            AgentStateField::AgentId => "agent_id",
            AgentStateField::AgentName => "agent_name",
            AgentStateField::Messages => "messages",
            AgentStateField::Position => "position",
            AgentStateField::Direction => "direction",
            AgentStateField::Velocity => "velocity",

            AgentStateField::Shape => "shape",
            AgentStateField::Height => "height",
            AgentStateField::Scale => "scale",
            AgentStateField::Color => "color",
            AgentStateField::Rgb => "rgb",
            AgentStateField::Hidden => "hidden",

            AgentStateField::Extra(_) => "extra",
        }
    }
}

impl<'de> Deserialize<'de> for AgentStateField {
    fn deserialize<D>(deserializer: D) -> Result<AgentStateField, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct FieldVisitor;

        impl Visitor<'_> for FieldVisitor {
            type Value = AgentStateField;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("json keys")
            }

            fn visit_str<E>(self, value: &str) -> Result<AgentStateField, E>
            where
                E: de::Error,
            {
                for field in AgentStateField::FIELDS {
                    if field.name() == value {
                        // note: this clone does not perform an allocation (enum variants with 0
                        // members get free clones)
                        return Ok(field.clone());
                    }
                }
                Ok(AgentStateField::Extra(value.to_string()))
            }
        }

        deserializer.deserialize_identifier(FieldVisitor)
    }
}

// TODO: remove dependency on legacy `AgentStateField` (contains references to package fields)
impl TryFrom<AgentStateField> for FieldType {
    type Error = Error;

    fn try_from(field: AgentStateField) -> Result<Self, Self::Error> {
        let name = field.name();

        let field_type = match field {
            AgentStateField::AgentId => {
                FieldType::new(FieldTypeVariant::Preset(PresetFieldType::Id), false)
            }
            AgentStateField::AgentName | AgentStateField::Shape | AgentStateField::Color => {
                FieldType::new(FieldTypeVariant::String, true)
            }
            AgentStateField::Position
            | AgentStateField::Direction
            | AgentStateField::Scale
            | AgentStateField::Velocity
            | AgentStateField::Rgb => FieldType::new(
                FieldTypeVariant::FixedLengthArray {
                    field_type: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
                    len: 3,
                },
                true,
            ),
            AgentStateField::Hidden => {
                // TODO: diff w/ `AgentStateField`

                FieldType::new(FieldTypeVariant::Boolean, false)
            }
            AgentStateField::Height => FieldType::new(FieldTypeVariant::Number, true),
            // Note `Messages` and `Extra` and 'BehaviorId' are not included in here:
            // 1) `Messages` as they are in a separate batch
            // 2) `Extra` as they are not yet implemented
            // 3) 'BehaviorId' as it is only used in hash_engine
            AgentStateField::Extra(_) | AgentStateField::Messages => {
                return Err(Error::from(format!(
                    "Cannot match built in field with name {}",
                    name
                )));
            }
        };
        Ok(field_type)
    }
}
