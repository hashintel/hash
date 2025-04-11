use hashql_core::id::Id as _;

use crate::{node::id::NodeId, visit::Visitor};

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
        self.next = self.next.next();
    }
}

impl Default for NodeRenumberer {
    fn default() -> Self {
        Self::new()
    }
}
