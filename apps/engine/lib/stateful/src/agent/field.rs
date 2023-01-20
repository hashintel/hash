use std::{
    collections::{HashMap, HashSet},
    fmt,
    ops::{Index, IndexMut},
};

use serde::{
    de::{self, Deserializer, MapAccess, Visitor},
    Deserialize, Serialize,
};
use uuid::Uuid;

use crate::{
    agent::AgentName,
    error::{Error, Result},
    field::{FieldType, FieldTypeVariant, PresetFieldType, UUID_V4_LEN},
    message, Vec3,
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

// NOTE: This is used in conjunction with the custom deserializaer
// PLEASE UPDATE THIS LIST WHEN YOU ADD ANOTHER BUILT IN FIELD
/// Built-in fields -- by default, these are automatically added to Agent State by the engine.
///
/// Also see [`AgentStateField`].
pub(crate) const BUILTIN_FIELDS: [&str; 12] = [
    AgentStateField::AgentId.name(),
    AgentStateField::AgentName.name(),
    AgentStateField::Messages.name(),
    AgentStateField::Position.name(),
    AgentStateField::Direction.name(),
    AgentStateField::Velocity.name(),
    AgentStateField::Shape.name(),
    AgentStateField::Height.name(),
    AgentStateField::Scale.name(),
    AgentStateField::Color.name(),
    AgentStateField::Rgb.name(),
    AgentStateField::Hidden.name(),
];

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AgentId {
    id: Uuid,
}

impl AgentId {
    pub fn generate() -> Self {
        Self { id: Uuid::new_v4() }
    }

    pub fn from_slice(b: &[u8]) -> Result<Self> {
        Ok(Self {
            id: Uuid::from_slice(b)?,
        })
    }

    pub fn from_bytes(b: [u8; UUID_V4_LEN]) -> Self {
        Self {
            id: Uuid::from_bytes(b),
        }
    }

    pub fn as_bytes(&self) -> &[u8; UUID_V4_LEN] {
        self.id.as_bytes()
    }
}

impl fmt::Display for AgentId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

/// `Agents` lie at the heart of _agent-based modeling_.
///
/// Every agent holds information describing itself. This collection of information is called the
/// _state_ of an agent. Every field corresponds to an [`AgentStateField`].
#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct Agent {
    /// The unique identifier (UUIDv4) of an agent.
    #[serde(default = "AgentId::generate")]
    pub agent_id: AgentId,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<AgentName>,

    /// Messages to be sent at the next step. (The Agent's "Outbox")
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub messages: Vec<message::Message>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Vec3>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<Vec3>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub velocity: Option<Vec3>,

    // Visualizer-specific
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<Vec3>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rgb: Option<Vec3>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,

    /// All fields that aren't built-in. Corresponds to [`AgentStateField::Extra`].
    #[serde(default, flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

// Custom deserializer for AgentState
// Differences (from serde_derive):
//  Agent ID will be auto generated if not explicitely given
//  Messages are parsed using an intermediate state
//  Messages are saved until the very end of parsing the agent state
//
// Links:
//  https://serde.rs/impl-deserialize.html
//  https://serde.rs/deserialize-struct.html
impl<'de> Deserialize<'de> for Agent {
    #[allow(clippy::too_many_lines)]
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct AgentVisitor;
        impl<'de> Visitor<'de> for AgentVisitor {
            type Value = Agent;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("struct AgentState")
            }

            fn visit_map<V>(self, mut map: V) -> Result<Agent, V::Error>
            where
                V: MapAccess<'de>,
            {
                // I originally wanted to collect the map's entries into (k, v) tuples
                // and reorder them based on some priority, but encountered issues with using
                // implicit From/Into with stored serde_json::Value's (which currently infer their
                // context for correct type parsing / error handling)
                // This serves as a simpler, finer constrained alternative
                struct BufferedOutboundMessageVec(serde_json::Value);
                impl BufferedOutboundMessageVec {
                    fn consume<E: de::Error>(
                        self,
                        buffer_state: &Agent,
                    ) -> Result<Vec<message::Message>, E> {
                        Ok(
                            match message::Message::from_json_array_with_state(self.0, buffer_state)
                            {
                                Ok(m) => m,
                                Err(_) => {
                                    return Err(de::Error::invalid_value(
                                        de::Unexpected::Other("non OutboundMessage"),
                                        &"OutboundMessage",
                                    ));
                                }
                            },
                        )
                    }
                }

                // empty comes with our defaults already applied
                let mut agent_state_buf: Agent = Agent::empty();

                let mut set_fields = HashSet::new();

                let mut held_messages: Option<BufferedOutboundMessageVec> = None;

                while let Some(key) = map.next_key()? {
                    let key: AgentStateField = key;
                    match &key {
                        AgentStateField::Extra(_) => {} // do not mark extra keys as seen
                        _ => {
                            if set_fields.contains(&key) {
                                return Err(de::Error::duplicate_field(key.name()));
                            } else {
                                set_fields.insert(key.clone());
                            }
                        }
                    }
                    match key {
                        AgentStateField::AgentId => {
                            agent_state_buf.agent_id = map.next_value()?;
                        }
                        AgentStateField::AgentName => {
                            agent_state_buf.agent_name = Some(map.next_value()?);
                        }
                        AgentStateField::Messages => {
                            let messages_value: serde_json::Value = map.next_value()?;
                            if std::matches!(messages_value, serde_json::Value::Array(_)) {
                                // set held messages
                                held_messages = Some(BufferedOutboundMessageVec(messages_value));
                            } else {
                                return Err(de::Error::invalid_type(
                                    // Could match all types, or just catch-all and say
                                    // what was expected
                                    de::Unexpected::Other("non message::Outbound array"),
                                    &"an array of message::Outbound",
                                ));
                            }
                        }
                        AgentStateField::Position => {
                            agent_state_buf.position = map.next_value()?;
                        }
                        AgentStateField::Direction => {
                            agent_state_buf.direction = Some(map.next_value()?);
                        }
                        AgentStateField::Velocity => {
                            agent_state_buf.velocity = Some(map.next_value()?);
                        }
                        AgentStateField::Shape => {
                            agent_state_buf.shape = Some(map.next_value()?);
                        }
                        AgentStateField::Height => {
                            agent_state_buf.height = Some(map.next_value()?);
                        }
                        AgentStateField::Scale => {
                            // The default values for a Vec3 are all zeros. However, we
                            // want the scale field values to default to 1.
                            // e.g. [5, 10] --> Vec3(5.0, 10.0, 1.0)
                            let v: serde_json::Value = map.next_value()?;
                            let scale = to_vec3_default(v, 1.0)
                                .map_err(|s| de::Error::custom(format!("scale: {}", s)))?;
                            agent_state_buf.scale = scale;
                        }
                        AgentStateField::Color => {
                            agent_state_buf.color = Some(map.next_value()?);
                        }
                        AgentStateField::Rgb => {
                            agent_state_buf.rgb = Some(map.next_value()?);
                        }
                        AgentStateField::Hidden => {
                            agent_state_buf.hidden = map.next_value()?;
                        }
                        AgentStateField::Extra(extra) => {
                            agent_state_buf.custom.insert(extra, map.next_value()?);
                        }
                    }
                }
                if let Some(messages) = held_messages {
                    agent_state_buf.messages = messages.consume::<V::Error>(&agent_state_buf)?;
                }
                Ok(agent_state_buf)
            }
        }
        deserializer.deserialize_struct("AgentState", &BUILTIN_FIELDS, AgentVisitor)
    }
}

#[inline]
fn to_f64_default(val: Option<&serde_json::Value>, default: f64) -> Option<f64> {
    match val {
        None => Some(default),
        Some(v) => v.as_f64(),
    }
}

fn to_vec3_default(val: serde_json::Value, default: f64) -> Result<Option<Vec3>, String> {
    match val {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Array(arr) => {
            let x = to_f64_default(arr.get(0), default);
            let y = to_f64_default(arr.get(1), default);
            let z = to_f64_default(arr.get(2), default);
            if x.is_none() || y.is_none() || z.is_none() {
                return Err("all elements must be numbers".into());
            }
            Ok(Some(Vec3(x.unwrap(), y.unwrap(), z.unwrap())))
        }
        _ => Err("must be an array or null".into()),
    }
}

#[test]
/// This test describes the scenario in which a message is parsed before the agent_id key
/// when enumerating over the MapAccess entries when deserializing JSON
fn deserialize_messages_before_agent_id() {
    let agent: Agent = serde_json::from_str(
        r#"
        {
            "messages": [{
                "type": "remove_agent"
            }],
            "agent_id": "12345678-90AB-CDEF-1234-567890ABCDEF"
        }
        "#,
    )
    .expect("Should be valid AgentState");
    if let Some(message::Message::RemoveAgent(message::payload::RemoveAgent { data, .. })) =
        agent.messages.get(0)
    {
        assert_eq!(agent.agent_id, data.agent_id);
    }
}

#[test]
fn deserialize_duplicate_agent_state_field() {
    let agent: serde_json::Result<Agent> = serde_json::from_str(
        r#"
        {
            "agent_name": "test",
            "agent_name": "test"
        }
        "#,
    );
    assert!(
        agent.is_err(),
        "this should result in a duplicate field error"
    );
}

impl Default for Agent {
    fn default() -> Self {
        Self {
            agent_id: AgentId::generate(),
            ..Agent::empty()
        }
    }
}

pub trait StrVec {
    fn to_vec(&self) -> Vec<String>;
}

impl StrVec for &str {
    fn to_vec(&self) -> Vec<String> {
        vec![(*self).to_string()]
    }
}

impl<T> StrVec for &[T]
where
    T: AsRef<str> + ToString,
{
    fn to_vec(&self) -> Vec<String> {
        self.iter().map(ToString::to_string).collect()
    }
}

impl<T> StrVec for Vec<T>
where
    T: AsRef<str> + ToString,
{
    fn to_vec(&self) -> Vec<String> {
        self.iter().map(ToString::to_string).collect()
    }
}

impl Agent {
    /// `delete_custom` removes a custom field from the agent state entirely
    // TODO: UNUSED: Needs triage
    pub fn delete_custom(&mut self, key: &str) {
        self.custom.remove(key);
    }

    /// `set_unchecked` is the same as set, but will panic if any erorrs occurs
    // TODO: UNUSED: Needs triage
    pub fn set_unchecked<V>(&mut self, key: &str, value: V)
    where
        V: Serialize,
    {
        self.set(key, value)
            .expect("Agent::set() This should not fail")
    }

    /// `is_field_name` will return whether or not the provided name is part of the required
    /// fields to fully make up an `Agent`
    ///
    /// TODO: This should utilize some macro to auto generate `BUILTIN_FIELDS`, instead of
    /// having us manually update it
    pub fn is_field_name<S>(string: S) -> bool
    where
        S: AsRef<str>,
    {
        let string = string.as_ref();
        BUILTIN_FIELDS.iter().any(|x| x == &string)
    }

    /// `set` will set /any/ property of the agent state as long as the value is
    /// serde serialiable
    ///
    /// # Errors
    /// `set` will return an error if `value` is not a valid JSON value.
    pub fn set<S, V>(&mut self, key: S, value: V) -> Result<()>
    where
        S: AsRef<str>,
        V: Serialize,
    {
        let key = key.as_ref();
        if Agent::is_field_name(key) {
            return self.set_known_field(key, serde_json::to_value(value)?);
        }

        if self.custom.contains_key(key) {
            self.custom.remove(key);
        }

        self.custom
            .insert(key.to_string(), serde_json::to_value(value)?);

        Ok(())
    }

    /// `get_custom` is a utility function to easily get typed objects from the 'custom' map
    /// for accessing properties decompiled into the struct, use the fields themselves
    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn get_custom<T>(&self, key: &str) -> Option<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        self.custom
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    #[must_use]
    pub fn empty() -> Agent {
        Agent {
            agent_id: AgentId::generate(),
            agent_name: None,

            messages: vec![],

            position: None,
            direction: None,
            velocity: None,

            shape: None,
            height: None,
            scale: None,
            color: None,
            rgb: None,
            hidden: false,

            custom: HashMap::new(),
        }
    }

    /// `add_message` will attempt to add a message to the `Agent`'s outbound message queue based
    /// on `kind`. It works just like `add_message`, but accepts a collection of values
    /// for `to`.
    ///
    /// # Errors
    /// `add_message` will return an error if the data provided is both required and an invalid JSON
    /// value.
    // TODO: UNUSED: Needs triage
    pub fn add_message<T: StrVec>(
        &mut self,
        to: &T,
        kind: &str,
        data: Option<serde_json::Value>,
    ) -> Result<()> {
        self.messages.push(match kind {
            message::payload::RemoveAgent::KIND => {
                message::Message::RemoveAgent(message::payload::RemoveAgent {
                    r#type: message::RemoveAgent::Type,
                    to: to.to_vec(),
                    data: serde_json::from_value(
                        // if the data is None, default to using just the agent_id of the `self`
                        // agent
                        data.unwrap_or_else(|| {
                            let mut map = serde_json::Map::new();
                            map.insert(
                                String::from("agent_id"),
                                serde_json::Value::String(self.agent_id.to_string()),
                            );
                            serde_json::Value::Object(map)
                        }),
                    )?,
                })
            }
            message::payload::CreateAgent::KIND => {
                message::Message::CreateAgent(message::payload::CreateAgent {
                    r#type: message::CreateAgent::Type,
                    to: to.to_vec(),
                    data: serde_json::from_value(
                        data.ok_or_else(|| Error::from("Missing AgentState to create"))?,
                    )?,
                })
            }
            message::payload::StopSim::KIND => {
                message::Message::StopSim(message::payload::StopSim {
                    r#type: message::StopSim::Type,
                    to: to.to_vec(),
                    data,
                })
            }
            _ => message::Message::Generic(message::payload::Generic {
                r#type: kind.to_string(),
                to: to.to_vec(),
                data,
            }),
        });
        Ok(())
    }

    /// `get_pos` will return a reference to the position of the `Agent`.
    ///
    /// # Errors
    /// `get_pos` will fail if the agent does not have a position.
    // TODO: UNUSED: Needs triage
    pub fn get_pos(&self) -> Result<&Vec3> {
        self.position
            .as_ref()
            .ok_or_else(|| format!("Agent {} does not have a position", &self.agent_id).into())
    }

    /// `get_pos` will return a mutable reference to the position of the `Agent`.
    ///
    /// # Errors
    /// `get_pos` will fail if the agent does not have a position.
    // TODO: UNUSED: Needs triage
    pub fn get_pos_mut(&mut self) -> Result<&mut Vec3> {
        let error: Error = format!("Agent {} does not have a position", &self.agent_id).into();
        self.position.as_mut().ok_or(error)
    }

    /// `get_pos` will return a reference to the direction of the `Agent`.
    ///
    /// # Errors
    /// `get_pos` will fail if the agent does not have a direction.
    // TODO: UNUSED: Needs triage
    pub fn get_dir(&self) -> Result<&Vec3> {
        self.direction
            .as_ref()
            .ok_or_else(|| format!("Agent {} does not have a direction", &self.agent_id).into())
    }

    /// `get_pos` will return a mutable reference to the direction of the `Agent`.
    ///
    /// # Errors
    /// `get_pos` will fail if the agent does not have a direction.
    // TODO: UNUSED: Needs triage
    pub fn get_dir_mut(&mut self) -> Result<&mut Vec3> {
        let error: Error = format!("Agent {} does not have a direction", self.agent_id).into();
        self.direction.as_mut().ok_or(error)
    }

    #[must_use]
    // TODO: UNUSED: Needs triage
    pub fn working_copy(&self) -> Self {
        Agent {
            agent_id: self.agent_id,
            agent_name: self.agent_name.clone(),

            // the working copy doesn't have the old messages
            messages: vec![],

            position: self.position,
            direction: self.direction,
            velocity: self.velocity,

            shape: self.shape.clone(),
            height: self.height,
            scale: self.scale,
            color: self.color.clone(),
            rgb: self.rgb,
            hidden: self.hidden,

            custom: self.custom.clone(),
        }
    }

    #[must_use]
    // TODO: UNUSED: Needs triage
    pub fn child(&self) -> Self {
        Agent {
            // children get a new uuid
            agent_id: AgentId::generate(),
            // children do not get the same name
            agent_name: None,
            // children do not inherit messages
            messages: vec![],

            position: self.position,
            direction: self.direction,
            velocity: self.velocity,

            shape: self.shape.clone(),
            height: self.height,
            scale: self.scale,
            color: self.color.clone(),
            rgb: self.rgb,
            hidden: self.hidden,

            custom: self.custom.clone(),
        }
    }

    /// `get_as_json` will return a new `serde_json::Value` given the provided `key`.
    ///
    /// # Errors
    /// `get_as_json` will return an error if any of the values provided under `key` are not valid
    /// JSON values. (TODO: investigate / is this even possible?)
    pub fn get_as_json(&self, key: &str) -> Result<serde_json::Value> {
        match key {
            "agent_id" => serde_json::to_value(&self.agent_id),
            "agent_name" => serde_json::to_value(&self.agent_name),
            "messages" => serde_json::to_value(&self.messages),
            "position" => serde_json::to_value(&self.position),
            "direction" => serde_json::to_value(&self.direction),
            "velocity" => serde_json::to_value(&self.velocity),
            "shape" => serde_json::to_value(&self.shape),
            "height" => serde_json::to_value(&self.height),
            "scale" => serde_json::to_value(&self.scale),
            "color" => serde_json::to_value(&self.color),
            "rgb" => serde_json::to_value(&self.rgb),
            "hidden" => serde_json::to_value(&self.hidden),
            _ => Ok(self[key].clone()),
        }
        .map_err(|e| e.into())
    }

    /// `set_known_field` will match upon `key` and set the field directly on the `Agent` struct
    /// rather than the custom hashmap. If the key is NOT available on the struct, it will use the
    /// `Index` trait implementation to add it to the custom properties hashmap.
    ///
    /// # Errors
    /// `set_known_field` will error if `value` is not a valid JSON value.
    pub fn set_known_field(&mut self, key: &str, value: serde_json::Value) -> Result<()> {
        match key {
            "agent_id" => self.agent_id = serde_json::from_value(value)?,
            "agent_name" => self.agent_name = serde_json::from_value(value)?,
            "messages" => {
                self.messages = message::Message::from_json_array_with_state(value, self)?
            }
            "position" => self.position = serde_json::from_value(value)?,
            "direction" => self.direction = serde_json::from_value(value)?,
            "velocity" => self.velocity = serde_json::from_value(value)?,
            "shape" => self.shape = serde_json::from_value(value)?,
            "height" => self.height = serde_json::from_value(value)?,
            "scale" => self.scale = serde_json::from_value(value)?,
            "color" => self.color = serde_json::from_value(value)?,
            "rgb" => self.rgb = serde_json::from_value(value)?,
            "hidden" => self.hidden = serde_json::from_value(value)?,
            _ => self[key] = value,
        }

        Ok(())
    }

    #[must_use]
    // TODO: UNUSED: Needs triage
    pub fn has(&self, key: &str) -> bool {
        for &builtin in &BUILTIN_FIELDS {
            if key == builtin {
                return true;
            }
        }

        self.custom.get(key).is_some()
    }
}

impl Index<&str> for Agent {
    type Output = serde_json::Value;

    fn index(&self, index: &str) -> &Self::Output {
        for &builtin in &BUILTIN_FIELDS {
            if index == builtin {
                self.get_as_json(index)
                    .expect("Built-in field should be accessible");
            }
        }

        match self.custom.get(index) {
            None => &serde_json::Value::Null,
            Some(v) => v,
        }
    }
}

impl IndexMut<&str> for Agent {
    fn index_mut(&mut self, index: &str) -> &mut serde_json::Value {
        for &builtin in &BUILTIN_FIELDS {
            if index == builtin {
                panic!("Cannot access {} through []. Access it directly", index);
            }
        }

        if self.custom.get(index).is_none() {
            self.custom
                .insert(index.to_string(), serde_json::Value::Null);
        }

        self.custom.get_mut(index).unwrap()
    }
}

impl From<serde_json::Value> for Agent {
    fn from(v: serde_json::Value) -> Self {
        match serde_json::from_value(v) {
            Ok(v) => v,
            Err(err) => panic!("{}", err),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::message;

    #[test]
    fn agent_state_ergonomics() -> Result<()> {
        let mut agent = Agent::default();
        // testing set
        agent.set("boolean", true)?;
        // testing get
        assert_eq!(agent.get_custom::<bool>("boolean"), Some(true));
        Ok(())
    }

    #[test]
    fn test_state_custom_fields() {
        let mut agent = Agent::default();
        agent.set("bar", "foo").expect("Failed to set bar to foo");
        agent["qux"] = "fritz".into();

        let json = serde_json::to_value(agent).unwrap();

        assert_eq!(json["bar"], "foo");
        assert_eq!(json["qux"], "fritz");
    }

    #[test]
    fn test_empty_state() {
        let json = "{}";

        assert!(serde_json::from_str::<Agent>(json).is_ok());
    }

    #[test]
    fn test_position_was_corrected_ignored() {
        let agent = Agent::default();

        match serde_json::to_value(&agent).unwrap() {
            serde_json::Value::Object(map) => assert!(!map.contains_key("position_was_corrected")),
            _ => panic!("`serde_json::Value::Object` expected"),
        }
    }

    #[test]
    fn test_position() {
        let json = r#"{ "position": [1, 2] }"#;

        let agent: Agent = serde_json::from_str(json).unwrap();
        let pos = agent.position.unwrap();

        assert_eq!(pos.0, 1.0);
        assert_eq!(pos.1, 2.0);
        assert_eq!(pos.2, 0.0);
    }

    #[test]
    fn test_scale() {
        let json = r#"{ "scale": [5, 2]}"#;
        let agent: Agent = serde_json::from_str(json).unwrap();
        let scale = agent.scale.unwrap();

        assert_eq!(scale.0, 5.0);
        assert_eq!(scale.1, 2.0);
        assert_eq!(scale.2, 1.0);

        let map = serde_json::to_value(&agent)
            .unwrap()
            .as_object()
            .unwrap()
            .clone();
        let arr = map["scale"].clone();
        assert_eq!(arr, json!([5.0, 2.0, 1.0]));
    }

    #[test]
    fn test_scale_default() {
        let agent = Agent::default();
        assert_eq!(agent.scale, None);
    }

    #[test]
    fn test_scale_invalid() {
        let json = r#"{ "scale": [5, 2, "123"]}"#;
        assert!(serde_json::from_str::<Agent>(json).is_err());
    }

    #[test]
    #[should_panic]
    fn test_from_invalid_json() {
        let _: Agent = json!({
            "agent_id": "puppa",
            "position": "invalid",
        })
        .into();
    }

    #[test]
    fn test_create_agent_message() {
        let msg = message::Message::CreateAgent(message::payload::CreateAgent {
            r#type: message::CreateAgent::Type,
            to: vec!["hash".to_string()],
            data: Agent::default(),
        });

        let json = serde_json::to_string(&msg).unwrap();

        let msg_from_json: message::Message = serde_json::from_str(&json).unwrap();

        match msg_from_json {
            message::Message::CreateAgent(_) => (),
            _ => panic!("Expected CreateAgent message"),
        };
    }

    #[test]
    fn test_remove_agent_message() {
        let msg = message::Message::RemoveAgent(message::payload::RemoveAgent {
            r#type: message::RemoveAgent::Type,
            to: vec!["hash".to_string()],
            data: message::payload::RemoveAgentData {
                agent_id: AgentId::generate(),
            },
        });

        let json = serde_json::to_string(&msg).unwrap();

        let msg_from_json: message::Message = serde_json::from_str(&json).unwrap();

        match msg_from_json {
            message::Message::RemoveAgent(_) => (),
            _ => panic!("Expected RemoveAgent message"),
        };
    }

    #[test]
    fn test_stop_message() {
        let msg = message::Message::StopSim(message::payload::StopSim {
            r#type: message::StopSim::Type,
            to: vec!["hash".to_string()],
            data: Some(json!({
                "status": "success",
                "reason": "stop condition reached",
            })),
        });

        let json = serde_json::to_string(&msg).unwrap();
        let msg_from_json: message::Message = serde_json::from_str(&json).unwrap();

        match msg_from_json {
            message::Message::StopSim(_) => (),
            _ => panic!("Expected StopSim message"),
        };
    }

    #[test]
    fn test_generic_message() {
        let msg = message::Message::Generic(message::payload::Generic {
            r#type: "custom_message".to_string(),
            to: vec!["some_other_agent".to_string()],
            data: Some(json!({
                "foo": "bar",
            })),
        });

        let json = serde_json::to_string(&msg).unwrap();

        let msg_from_json: message::Message = serde_json::from_str(&json).unwrap();

        match msg_from_json {
            message::Message::Generic(msg) => {
                assert_eq!(msg.to, vec!["some_other_agent"]);
            }
            _ => panic!("Expected Generic message"),
        };
    }

    #[test]
    fn test_add_message() {
        let mut agent = Agent::default();
        let data = Some(json!({"foo": "bar"}));
        agent
            .add_message(&"alice", "custom_message", data.clone())
            .unwrap();
        assert_eq!(agent.messages, vec![message::Message::Generic(
            message::payload::Generic {
                data,
                to: vec!["alice".to_string()],
                r#type: "custom_message".to_string(),
            }
        )]);
    }

    #[test]
    fn test_add_message_multiple() {
        let mut agent = Agent::default();
        let data = Some(json!({"foo": "bar"}));
        let to: Vec<String> = vec!["alice".to_string(), "bob".to_string()];
        agent
            .add_message(&to, "custom_message", data.clone())
            .unwrap();
        assert_eq!(agent.messages, vec![message::Message::Generic(
            message::payload::Generic {
                data,
                to,
                r#type: "custom_message".to_string(),
            }
        )]);
    }
}
