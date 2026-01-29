use hashql_core::symbol::{Symbol, sym};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum AccessMode {
    Direct,
    Composite,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Access {
    Postgres(AccessMode),
    Embedding(AccessMode),
}

/// A node in the path access trie.
///
/// Each node represents a field in a path hierarchy and defines:
/// - The field name this node matches (`name`).
/// - What access applies when the path ends at this node (`access`).
/// - What access applies for unknown/deeper paths (`otherwise`).
/// - What children exist for further path traversal.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PathNode {
    /// Field name this node matches (empty string for root).
    name: Symbol<'static>,
    /// Access level when the path ends at this node (no more projections).
    pub access: Option<Access>,
    /// Access level for paths beyond known children (e.g., JSONB allows any sub-path).
    pub otherwise: Option<Access>,
    /// Child nodes.
    pub children: &'static [Self],
}

impl PathNode {
    pub(crate) const fn root(children: &'static [Self]) -> Self {
        Self {
            name: sym::lexical::entity,
            access: None,
            otherwise: None,
            children,
        }
    }

    pub(crate) const fn leaf(
        name: Symbol<'static>,
        access: impl [const] Into<Option<Access>>,
    ) -> Self {
        Self {
            name,
            access: access.into(),
            otherwise: None,
            children: &[],
        }
    }

    /// Creates a JSONB node where any sub-path is also Postgres-accessible.
    pub(crate) const fn jsonb(name: Symbol<'static>) -> Self {
        Self {
            name,
            access: Some(Access::Postgres(AccessMode::Direct)),
            otherwise: Some(Access::Postgres(AccessMode::Direct)),
            children: &[],
        }
    }

    pub(crate) const fn branch(
        name: Symbol<'static>,
        access: impl [const] Into<Option<Access>>,
        children: &'static [Self],
    ) -> Self {
        Self {
            name,
            access: access.into(),
            otherwise: None,
            children,
        }
    }

    pub(crate) fn lookup(&self, name: Symbol<'_>) -> Option<&Self> {
        self.children.iter().find(|node| node.name == name)
    }
}
