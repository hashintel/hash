#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use serde::Serialize;

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

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(serde_plain::from_str(s)?)
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

#[cfg(test)]
mod tests {
    use cedar_policy_core::ast;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use super::ActionConstraint;
    use crate::{
        policies::ActionId,
        test_utils::{check_deserialization_error, check_serialization},
    };

    #[track_caller]
    pub(crate) fn check_action(
        constraint: ActionConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) {
        check_serialization(&constraint, value);

        let cedar_policy = ast::ActionConstraint::from(&constraint);
        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());
        ActionConstraint::try_from(cedar_policy)
            .expect("should be able to convert Cedar policy back");
    }

    #[test]
    fn constraint_all() {
        check_action(
            ActionConstraint::All {},
            json!({
                "type": "all",
            }),
            "action",
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "all",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        );
    }

    #[test]
    fn constraint_one() {
        let action = ActionId::ViewProperties;
        check_action(
            ActionConstraint::One { action },
            json!({
                "type": "one",
                "action": action,
            }),
            format!(r#"action == HASH::Action::"{action}""#),
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "one",
            }),
            "missing field `action`",
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "one",
                "action": action,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `action`",
        );
    }

    #[test]
    fn constraint_many() {
        let actions = [ActionId::ViewProperties, ActionId::ViewMetadata];
        check_action(
            ActionConstraint::Many {
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
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "many",
            }),
            "missing field `actions`",
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "many",
                "actions": actions,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `actions`",
        );
    }
}
