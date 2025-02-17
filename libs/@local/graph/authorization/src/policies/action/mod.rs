#![expect(
    clippy::empty_enum,
    reason = "serde::Deserialize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use serde::Serialize as _;

use crate::policies::cedar::CedarEntityId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionId {
    View,
    ViewProperties,
    ViewMetadata,
}

impl CedarEntityId for ActionId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Action"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(serde_plain::from_str(eid.as_ref())?)
    }
}

impl FromStr for ActionId {
    type Err = Report<impl Error + Send + Sync + 'static>;

    fn from_str(action: &str) -> Result<Self, Self::Err> {
        Ok(serde_plain::from_str(action)?)
    }
}

impl fmt::Display for ActionId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl ActionId {
    #[must_use]
    pub const fn parents(self) -> &'static [Self] {
        match self {
            Self::View => &[],
            Self::ViewProperties | Self::ViewMetadata => &[Self::View],
        }
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum InvalidActionConstraint {
    #[display("Invalid action in constraint")]
    InvalidAction,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ActionConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    All {},
    One {
        action: ActionId,
    },
    Many {
        actions: Vec<ActionId>,
    },
}

impl ActionConstraint {
    pub(crate) fn try_from_cedar(
        constraint: &ast::ActionConstraint,
    ) -> Result<Self, Report<InvalidActionConstraint>> {
        Ok(match constraint {
            ast::ActionConstraint::Any => Self::All {},
            ast::ActionConstraint::Eq(action) => Self::One {
                action: ActionId::from_euid(action)
                    .change_context(InvalidActionConstraint::InvalidAction)?,
            },
            ast::ActionConstraint::In(actions) => Self::Many {
                actions: actions
                    .iter()
                    .map(|action| ActionId::from_euid(action))
                    .try_collect_reports()
                    .change_context(InvalidActionConstraint::InvalidAction)?,
            },
        })
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::ActionConstraint {
        match self {
            Self::All {} => ast::ActionConstraint::any(),
            Self::One { action } => ast::ActionConstraint::is_eq(action.to_euid()),
            Self::Many { actions } => {
                ast::ActionConstraint::is_in(actions.iter().map(ActionId::to_euid))
            }
        }
    }
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod tests {
    use core::error::Error;

    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use super::ActionConstraint;
    use crate::{
        policies::ActionId,
        test_utils::{check_deserialization_error, check_serialization},
    };

    #[track_caller]
    pub(crate) fn check_action(
        constraint: &ActionConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(constraint, value);

        let cedar_constraint = constraint.to_cedar();
        assert_eq!(cedar_constraint.to_string(), cedar_string.as_ref());
        ActionConstraint::try_from_cedar(&cedar_constraint)?;
        Ok(())
    }

    #[test]
    fn constraint_all() -> Result<(), Box<dyn Error>> {
        check_action(
            &ActionConstraint::All {},
            json!({
                "type": "all",
            }),
            "action",
        )?;

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "all",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_one() -> Result<(), Box<dyn Error>> {
        let action = ActionId::ViewProperties;
        check_action(
            &ActionConstraint::One { action },
            json!({
                "type": "one",
                "action": action,
            }),
            format!(r#"action == HASH::Action::"{action}""#),
        )?;

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "one",
            }),
            "missing field `action`",
        )?;

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "one",
                "action": action,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `action`",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_many() -> Result<(), Box<dyn Error>> {
        let actions = [ActionId::ViewProperties, ActionId::ViewMetadata];
        check_action(
            &ActionConstraint::Many {
                actions: actions.to_vec(),
            },
            json!({
                "type": "many",
                "actions": actions,
            }),
            format!(
                r#"action in [HASH::Action::"{}",HASH::Action::"{}"]"#,
                actions[0], actions[1]
            ),
        )?;

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "many",
            }),
            "missing field `actions`",
        )?;

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "many",
                "actions": actions,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `actions`",
        )?;

        Ok(())
    }
}
