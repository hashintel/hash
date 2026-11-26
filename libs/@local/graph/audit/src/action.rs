//! The actions audit events record.

use core::fmt::Debug;

use serde_core::Serialize;

use crate::target::Target;

/// The name of an action an audit event records.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AuditActionName {
    ApiTokenCreate,
    ApiTokenRevoke,
    UserDelete,
}

impl AuditActionName {
    /// Returns the name the action is recorded under.
    ///
    /// Recorded audit events are never rewritten, so the name of an action never changes.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ApiTokenCreate => "api_token.create",
            Self::ApiTokenRevoke => "api_token.revoke",
            Self::UserDelete => "user.delete",
        }
    }
}

/// An action an audit event records.
///
/// The crate that owns a change defines the type for its action. The serialized fields of that
/// type are the details of the action, and a field needed only for the
/// [`target`](Self::target) is skipped with `#[serde(skip)]`. The details hold identifiers and
/// enumerated values only: no entity content, credentials, tokens, email addresses or names.
pub trait AuditAction: Debug + Serialize {
    /// The name the action is recorded under.
    const NAME: AuditActionName;

    /// Returns the object the action was performed on.
    fn target(&self) -> Option<Target>;
}
