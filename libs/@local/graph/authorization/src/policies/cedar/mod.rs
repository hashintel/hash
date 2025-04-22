mod entity;
mod expression_tree;
mod ontology;
mod visitor;
mod web;

use alloc::sync::Arc;
use core::iter;

use cedar_policy_core::ast;
use error_stack::{IntoReport, Report, ResultExt as _};

pub use self::expression_tree::PolicyExpressionTree;
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

pub(crate) trait ToCedarExpr {
    fn to_cedar(&self) -> ast::Expr;
}

pub(crate) trait FromCedarExpr: Sized {
    type Error: IntoReport;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error>;
}

pub(crate) trait FromCedarEntityId: Sized + 'static {
    type Error: IntoReport;

    fn entity_type() -> &'static Arc<ast::EntityType>;

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error>;
}

pub(crate) trait FromCedarEntityUId: Sized + 'static {
    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>>;
}

impl<T: FromCedarEntityId> FromCedarEntityUId for T {
    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>> {
        if *euid.entity_type() == **T::entity_type() {
            T::from_eid(euid.eid()).change_context(FromCedarRefernceError::InvalidCedarEntityId)
        } else {
            Err(Report::new(FromCedarRefernceError::UnexpectedEntityType {
                actual: euid.entity_type().clone(),
            }))
        }
    }
}

pub(crate) trait ToCedarEntityId: Sized {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType>;

    fn to_eid(&self) -> ast::Eid;

    fn to_euid(&self) -> ast::EntityUID {
        ast::EntityUID::from_components(
            ast::EntityType::clone(self.to_cedar_entity_type()),
            self.to_eid(),
            None,
        )
    }
}

pub(crate) trait ToCedarEntity: Sized + 'static {
    fn to_cedar_entity(&self) -> ast::Entity;
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
