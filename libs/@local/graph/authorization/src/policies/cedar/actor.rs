use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::principal::actor::{ActorEntityUuid, ActorId, AiId, MachineId, UserId};
use uuid::Uuid;

use super::CedarExpressionVisitor;

#[derive(Debug, derive_more::Display)]
pub(crate) enum ParseActorIdExpressionError {
    #[display("Unexpected fields: `{}`", _0.join(", "))]
    UnexpectedField(Vec<String>),
    #[display("Missing field: `{_0}`")]
    MissingField(String),
    #[display("Invalid type: `{_0}`")]
    InvalidTypeExpression(String),
    #[display("Invalid type: `{_0}`")]
    InvalidType(String),
    #[display("Invalid UUID expression: `{_0}`")]
    InvalidUuidExpression(String),
    #[display("Invalid UUID: `{_0}`")]
    InvalidUuid(String),
}

impl Error for ParseActorIdExpressionError {}

pub(crate) struct ActorIdVisitor;

impl CedarExpressionVisitor for ActorIdVisitor {
    type Error = Report<ParseActorIdExpressionError>;
    type Value = Option<ActorId>;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an actor id")
    }

    fn visit_record(
        &self,
        record: &BTreeMap<SmolStr, ast::Expr>,
    ) -> Option<Result<Self::Value, Self::Error>> {
        let Some(type_expr) = record.get("type") else {
            return Some(Err(Report::new(ParseActorIdExpressionError::MissingField(
                "type".to_owned(),
            ))));
        };
        let Some(uuid_expr) = record.get("id") else {
            return Some(Err(Report::new(ParseActorIdExpressionError::MissingField(
                "id".to_owned(),
            ))));
        };
        if record.len() != 2 {
            return Some(Err(Report::new(
                ParseActorIdExpressionError::UnexpectedField(
                    record
                        .keys()
                        .filter(|&key| (key != "type" && key != "id"))
                        .map(SmolStr::to_string)
                        .collect(),
                ),
            )));
        }

        let ast::ExprKind::Lit(ast::Literal::String(type_string)) = type_expr.expr_kind() else {
            return Some(Err(Report::new(
                ParseActorIdExpressionError::InvalidTypeExpression(type_expr.to_string()),
            )));
        };

        let ast::ExprKind::Lit(ast::Literal::String(uuid_string)) = uuid_expr.expr_kind() else {
            return Some(Err(Report::new(
                ParseActorIdExpressionError::InvalidUuidExpression(uuid_expr.to_string()),
            )));
        };

        let actor_entity_uuid = match Uuid::parse_str(uuid_string)
            .change_context_lazy(|| {
                ParseActorIdExpressionError::InvalidUuid(uuid_string.to_string())
            })
            .attach_printable("Invalid UUID")
        {
            Ok(uuid) => ActorEntityUuid::new(uuid),
            Err(error) => {
                return Some(Err(error));
            }
        };

        Some(Ok(match type_string.as_str() {
            "user" => Some(ActorId::User(UserId::new(actor_entity_uuid))),
            "machine" => Some(ActorId::Machine(MachineId::new(actor_entity_uuid))),
            "ai" => Some(ActorId::Ai(AiId::new(actor_entity_uuid))),
            "public" => None,
            _ => {
                return Some(Err(Report::new(ParseActorIdExpressionError::InvalidType(
                    type_string.to_string(),
                ))));
            }
        }))
    }
}
