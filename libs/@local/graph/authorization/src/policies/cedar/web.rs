use core::fmt;

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::principal::actor_group::WebId;

use super::{CedarExpressionVisitor, FromCedarEntityId as _};

pub(crate) struct WebIdVisitor;

impl CedarExpressionVisitor for WebIdVisitor {
    type Error = Report<uuid::Error>;
    type Value = WebId;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a web id EUID")
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Option<Result<Self::Value, Self::Error>> {
        (*euid.entity_type() == **WebId::entity_type()).then(|| WebId::from_eid(euid.eid()))
    }
}
