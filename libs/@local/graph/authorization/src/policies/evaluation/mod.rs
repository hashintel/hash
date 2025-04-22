use alloc::borrow::Cow;
use core::error::Error;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    principal::actor_group::WebId,
};

use super::{
    PartialResourceId,
    cedar::{
        BaseUrlVisitor, CedarExpressionVisitor, EntityTypeIdVisitor, EntityUuidVisitor,
        FromCedarEntityId as _, OntologyTypeVersionVisitor, WebIdVisitor, walk_expr,
    },
    resource::{EntityTypeId, ResourceVariableVisitor},
};

#[derive(Debug, derive_more::Display)]
pub enum ParsePermissionConditionError {
    #[display("Could not parse attribute")]
    InvalidAttribute,
    #[display("Could not parse resource id")]
    InvalidResourceId,
    #[display("Could not parse web id")]
    InvalidWebId,
}

impl Error for ParsePermissionConditionError {}

#[derive(Debug)]
pub enum PermissionCondition {
    Not(Box<Self>),
    All(Vec<Self>),
    Any(Vec<Self>),
    Is(PartialResourceId<'static>),
    In(WebId),
    Attribute(ResourceAttribute),
}

#[derive(Debug)]
pub enum ResourceAttribute {
    BaseUrl(BaseUrl),
    OntologyTypeVersion(OntologyTypeVersion),
    IsOfType(VersionedUrl),
}

pub(crate) struct ResourceAttributeVisitor;

impl CedarExpressionVisitor for ResourceAttributeVisitor {
    type Error = Report<ParsePermissionConditionError>;
    type Value = ResourceAttribute;

    fn expecting(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str("an attribute")
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let Ok(()) = ResourceVariableVisitor.visit_expr(expr)?;
                match attr.as_str() {
                    "base_url" => Some(
                        BaseUrlVisitor
                            .visit_expr(rhs)?
                            .change_context(ParsePermissionConditionError::InvalidAttribute)
                            .map(ResourceAttribute::BaseUrl),
                    ),
                    "ontology_type_version" => Some(
                        OntologyTypeVersionVisitor
                            .visit_expr(rhs)?
                            .change_context(ParsePermissionConditionError::InvalidAttribute)
                            .map(ResourceAttribute::OntologyTypeVersion),
                    ),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    fn visit_contains(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let Ok(()) = ResourceVariableVisitor.visit_expr(expr)?;
                match attr.as_str() {
                    "entity_types" => Some(
                        EntityTypeIdVisitor
                            .visit_expr(rhs)?
                            .change_context(ParsePermissionConditionError::InvalidAttribute)
                            .map(ResourceAttribute::IsOfType),
                    ),
                    _ => None,
                }
            }
            _ => None,
        }
    }
}

pub(crate) struct PermissionConditionVisitor;

impl CedarExpressionVisitor for PermissionConditionVisitor {
    type Error = Report<ParsePermissionConditionError>;
    type Value = PermissionCondition;

    fn expecting(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str("a permission condition")
    }

    fn visit_expr(&self, expr: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        ResourceAttributeVisitor.visit_expr(expr).map_or_else(
            || walk_expr(self, expr),
            |resource_attribute| Some(resource_attribute.map(PermissionCondition::Attribute)),
        )
    }

    fn visit_bool(&self, bool: bool) -> Option<Result<Self::Value, Self::Error>> {
        Some(Ok(if bool {
            PermissionCondition::All(Vec::new())
        } else {
            PermissionCondition::Any(Vec::new())
        }))
    }

    fn visit_not(&self, expr: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        Some(
            self.visit_expr(expr)?
                .map(|condition| PermissionCondition::Not(Box::new(condition))),
        )
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let mut all_conditions = Vec::new();

        match self.visit_expr(lhs)? {
            Ok(PermissionCondition::All(conditions)) => all_conditions.extend(conditions),
            Ok(condition) => all_conditions.push(condition),
            Err(error) => return Some(Err(error)),
        }

        match self.visit_expr(rhs)? {
            Ok(PermissionCondition::All(conditions)) => all_conditions.extend(conditions),
            Ok(condition) => all_conditions.push(condition),
            Err(error) => return Some(Err(error)),
        }

        Some(Ok(if all_conditions.len() == 1 {
            all_conditions
                .pop()
                .expect("should have exactly one condition")
        } else {
            PermissionCondition::All(all_conditions)
        }))
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let mut any_conditions = Vec::new();

        match self.visit_expr(lhs)? {
            Ok(PermissionCondition::Any(conditions)) => any_conditions.extend(conditions),
            Ok(condition) => any_conditions.push(condition),
            Err(error) => return Some(Err(error)),
        }

        match self.visit_expr(rhs)? {
            Ok(PermissionCondition::Any(conditions)) => any_conditions.extend(conditions),
            Ok(condition) => any_conditions.push(condition),
            Err(error) => return Some(Err(error)),
        }

        Some(Ok(if any_conditions.len() == 1 {
            any_conditions
                .pop()
                .expect("should have exactly one condition")
        } else {
            PermissionCondition::Any(any_conditions)
        }))
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let Ok(()) = ResourceVariableVisitor.visit_expr(lhs)?;

        #[expect(
            clippy::option_if_let_else,
            clippy::manual_map,
            reason = "this is more readable"
        )]
        if let Some(entity_type_id) = EntityTypeIdVisitor.visit_expr(rhs) {
            Some(
                entity_type_id
                    .change_context(ParsePermissionConditionError::InvalidResourceId)
                    .map(|entity_type_id| {
                        PermissionCondition::Is(PartialResourceId::EntityType(Some(Cow::Owned(
                            EntityTypeId::new(entity_type_id),
                        ))))
                    }),
            )
        } else if let Some(entity_uuid) = EntityUuidVisitor.visit_expr(rhs) {
            Some(
                entity_uuid
                    .change_context(ParsePermissionConditionError::InvalidResourceId)
                    .map(|entity_uuid| {
                        PermissionCondition::Is(PartialResourceId::Entity(Some(entity_uuid)))
                    }),
            )
        } else {
            None
        }
    }

    fn visit_is(
        &self,
        expr: &ast::Expr,
        entity_type: &ast::EntityType,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let Ok(()) = ResourceVariableVisitor.visit_expr(expr)?;

        if *entity_type == **EntityTypeId::entity_type() {
            Some(Ok(PermissionCondition::Is(PartialResourceId::EntityType(
                None,
            ))))
        } else if *entity_type == **EntityUuid::entity_type() {
            Some(Ok(PermissionCondition::Is(PartialResourceId::Entity(None))))
        } else {
            None
        }
    }

    fn visit_in(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let Ok(()) = ResourceVariableVisitor.visit_expr(lhs)?;
        Some(
            WebIdVisitor
                .visit_expr(rhs)?
                .change_context(ParsePermissionConditionError::InvalidWebId)
                .map(PermissionCondition::In),
        )
    }
}
