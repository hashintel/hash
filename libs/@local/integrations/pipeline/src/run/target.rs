use core::str::FromStr;

use hash_integrations_definition::{LinkId, StepId};
use serde::{Deserialize, Serialize};

/// Whether a target produces entities or links.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    derive_more::Display,
)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[display("entity")]
    Entity,
    #[display("link")]
    Link,
}

impl Kind {
    /// The persisted text.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Entity => "entity",
            Self::Link => "link",
        }
    }
}

impl FromStr for Kind {
    type Err = InvalidText;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "entity" => Ok(Self::Entity),
            "link" => Ok(Self::Link),
            _ => Err(InvalidText {
                text: text.into(),
                expected: "`entity` or `link`",
            }),
        }
    }
}

/// Why an entity is written.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    derive_more::Display,
)]
#[serde(rename_all = "lowercase")]
pub enum Change {
    #[display("insert")]
    Insert,
    #[display("update")]
    Update,
    #[display("resend")]
    Resend,
    #[display("archive")]
    Archive,
}

impl Change {
    /// The persisted text.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Insert => "insert",
            Self::Update => "update",
            Self::Resend => "resend",
            Self::Archive => "archive",
        }
    }
}

impl FromStr for Change {
    type Err = InvalidText;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "insert" => Ok(Self::Insert),
            "update" => Ok(Self::Update),
            "resend" => Ok(Self::Resend),
            "archive" => Ok(Self::Archive),
            _ => Err(InvalidText {
                text: text.into(),
                expected: "`insert`, `update`, `resend` or `archive`",
            }),
        }
    }
}

/// A stored string that does not identify the expected contract value.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{text}` is not {expected}")]
pub struct InvalidText {
    pub text: Box<str>,
    pub expected: &'static str,
}

/// A sink or link pipeline, including its kind so equal names cannot collide.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, derive_more::Display,
)]
#[display("{kind}/{id}")]
#[serde(try_from = "String", into = "String")]
pub struct Target {
    kind: Kind,
    id: Box<str>,
}

impl Target {
    /// Constructs a target after checking its name.
    ///
    /// # Errors
    /// Returns [`InvalidText`] for an invalid step or link name.
    pub fn new(kind: Kind, id: &str) -> Result<Self, InvalidText> {
        let valid = match kind {
            Kind::Entity => id.parse::<StepId>().is_ok(),
            Kind::Link => id.parse::<LinkId>().is_ok(),
        };
        if !valid {
            return Err(InvalidText {
                text: format!("{kind}/{id}").into_boxed_str(),
                expected: "a target such as `entity/sink-aircraft`",
            });
        }
        Ok(Self {
            kind,
            id: id.into(),
        })
    }

    /// Identifies an entity sink.
    #[must_use]
    pub fn entity(step: &StepId) -> Self {
        Self {
            kind: Kind::Entity,
            id: step.as_ref().into(),
        }
    }

    /// Identifies a link pipeline.
    #[must_use]
    pub fn link(link: &LinkId) -> Self {
        Self {
            kind: Kind::Link,
            id: link.as_ref().into(),
        }
    }

    #[must_use]
    pub const fn kind(&self) -> Kind {
        self.kind
    }

    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }
}

impl FromStr for Target {
    type Err = InvalidText;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let invalid = || InvalidText {
            text: text.into(),
            expected: "a target such as `entity/sink-aircraft`",
        };
        let (kind, id) = text.split_once('/').ok_or_else(invalid)?;
        Self::new(kind.parse().map_err(|_error| invalid())?, id).map_err(|_error| invalid())
    }
}
impl TryFrom<String> for Target {
    type Error = InvalidText;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse()
    }
}
impl From<Target> for String {
    fn from(target: Target) -> Self {
        target.to_string()
    }
}
