//! What the action an audit event records was performed on.

use type_system::principal::actor::UserId;
use uuid::Uuid;

/// The kind of object a [`Target`] identifies.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TargetKind {
    ApiToken,
    User,
}

impl TargetKind {
    /// Returns the name the kind is recorded under.
    ///
    /// Recorded audit events are never rewritten, so the name of a kind never changes.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ApiToken => "api_token",
            Self::User => "user",
        }
    }
}

/// An identifier of an object an action can be performed on.
///
/// The crate that defines an identifier implements it, which makes the identifier convertible
/// into a [`Target`] of its [`KIND`](Self::KIND).
pub trait TargetId: Into<Uuid> {
    /// The kind of object the identifier names.
    const KIND: TargetKind;
}

impl TargetId for UserId {
    const KIND: TargetKind = TargetKind::User;
}

/// The object an action was performed on.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Target {
    kind: TargetKind,
    id: Uuid,
}

impl Target {
    #[must_use]
    pub const fn kind(self) -> TargetKind {
        self.kind
    }

    #[must_use]
    pub const fn id(self) -> Uuid {
        self.id
    }
}

impl<I: TargetId> From<I> for Target {
    fn from(id: I) -> Self {
        Self {
            kind: I::KIND,
            id: id.into(),
        }
    }
}
