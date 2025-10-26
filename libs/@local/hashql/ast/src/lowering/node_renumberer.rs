use hashql_core::id::Id as _;

use crate::{node::id::NodeId, visit::Visitor};

/// A visitor that sequentially renumbers [`NodeId`]s in the AST.
///
/// This visitor traverses the AST and assigns sequential IDs to each node,
/// starting from [`NodeId::MIN`]. Before this lowering, you need to assume that each node has the
/// [`NodeId::PLACEHOLDER`] value assigned to them.
pub struct NodeRenumberer {
    next: NodeId,
}

impl NodeRenumberer {
    #[must_use]
    pub const fn new() -> Self {
        Self { next: NodeId::MIN }
    }
}

impl Visitor<'_> for NodeRenumberer {
    fn visit_id(&mut self, id: &mut NodeId) {
        *id = self.next;
        self.next.increment_by(1);
    }
}

impl Default for NodeRenumberer {
    fn default() -> Self {
        Self::new()
    }
}
