use hashql_core::symbol::{Symbol, sym};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Access {
    /// Maps to a single column or JSONB path. Any operation can be pushed.
    Direct,
    /// Maps to multiple columns in the same table. Only comparisons (==, !=) can be pushed,
    /// requiring the compiler to expand into column-wise comparisons.
    Composite,
    /// Contains synthesized data or spans multiple tables. Cannot be pushed to Postgres.
    None,
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
    pub access: Access,
    /// Access level for paths beyond known children (e.g., JSONB allows any sub-path).
    pub otherwise: Access,
    /// Child nodes.
    pub children: &'static [Self],
}

impl PathNode {
    pub(crate) const fn root(access: Access, children: &'static [Self]) -> Self {
        Self {
            name: sym::lexical::entity,
            access,
            otherwise: Access::None,
            children,
        }
    }

    pub(crate) const fn leaf(name: Symbol<'static>, access: Access) -> Self {
        Self {
            name,
            access,
            otherwise: Access::None,
            children: &[],
        }
    }

    pub(crate) const fn jsonb(name: Symbol<'static>) -> Self {
        Self {
            name,
            access: Access::Direct,
            otherwise: Access::Direct,
            children: &[],
        }
    }

    pub(crate) const fn branch(
        name: Symbol<'static>,
        access: Access,
        children: &'static [Self],
    ) -> Self {
        Self {
            name,
            access,
            otherwise: Access::None,
            children,
        }
    }

    pub(crate) fn lookup(&self, name: Symbol<'_>) -> Option<&Self> {
        self.children.iter().find(|node| node.name == name)
    }
}
