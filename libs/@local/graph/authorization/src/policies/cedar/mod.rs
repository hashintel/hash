mod entity;
mod ontology;
mod visitor;
mod web;

use alloc::sync::Arc;
use core::iter;

use cedar_policy_core::ast;
use error_stack::{IntoReport, Report, ResultExt as _, ensure};

pub(crate) use self::{
    entity::EntityUuidVisitor,
    ontology::{BaseUrlVisitor, EntityTypeIdVisitor, OntologyTypeVersionVisitor},
    visitor::{
        CedarExpressionParseError, CedarExpressionParser, CedarExpressionVisitor, SimpleParser,
        walk_expr,
    },
    web::WebIdVisitor,
};
use crate::policies::error::FromCedarRefernceError;

pub(crate) trait FromCedarExpr: Sized {
    type Error: IntoReport;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error>;
}

pub(crate) trait ToCedarExpr {
    fn to_cedar(&self) -> ast::Expr;
}

pub(crate) trait CedarEntityId: Sized + 'static {
    type Error: IntoReport;

    fn entity_type() -> &'static Arc<ast::EntityType>;

    fn to_eid(&self) -> ast::Eid;

    fn to_euid(&self) -> ast::EntityUID {
        ast::EntityUID::from_components(
            ast::EntityType::clone(Self::entity_type()),
            self.to_eid(),
            None,
        )
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error>;

    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>> {
        let entity_type = Self::entity_type();
        ensure!(
            *euid.entity_type() == **entity_type,
            FromCedarRefernceError::UnexpectedEntityType {
                expected: ast::EntityType::clone(entity_type),
                actual: euid.entity_type().clone(),
            }
        );
        Self::from_eid(euid.eid()).change_context(FromCedarRefernceError::FromCedarIdError)
    }
}

pub(crate) fn cedar_resource_type<const N: usize>(
    names: [&'static str; N],
) -> Arc<ast::EntityType> {
    let [namespaces @ .., name] = names.as_slice() else {
        panic!("names should not be empty")
    };

    Arc::new(ast::EntityType::from(
        ast::Name::try_from(ast::InternalName::new(
            name.parse().expect("name should be valid"),
            iter::once(&"HASH")
                .chain(namespaces)
                .map(|namespace| namespace.parse().expect("namespace should be valid")),
            None,
        ))
        .expect("name should be valid"),
    ))
}
