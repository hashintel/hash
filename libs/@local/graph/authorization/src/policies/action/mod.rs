#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

pub use self::group::{ActionGroup, ActionGroupName};

mod group;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    View,
    ViewProperties,
    ViewMetadata,
}

impl Action {
    #[must_use]
    pub const fn parents(self) -> &'static [Self] {
        match self {
            Self::View => &[],
            Self::ViewProperties | Self::ViewMetadata => &[Self::View],
        }
    }
}

impl AsRef<str> for Action {
    fn as_ref(&self) -> &str {
        match self {
            Self::View => "view",
            Self::ViewProperties => "viewProperties",
            Self::ViewMetadata => "viewMetadata",
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
    Action {
        action: Action,
    },
    Group {
        group: ActionGroup,
    },
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use super::ActionConstraint;
    use crate::{
        policies::Action,
        test_utils::{check_deserialization_error, check_serialization},
    };

    #[track_caller]
    pub(crate) fn check_action(
        constraint: ActionConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) {
        check_serialization(&constraint, value);

        assert_eq!(
            cedar_policy_core::ast::ActionConstraint::from(constraint).to_string(),
            cedar_string.as_ref(),
        );
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
    fn constraint_action() {
        let action = Action::ViewProperties;
        check_action(
            ActionConstraint::Action { action },
            json!({
                "type": "action",
                "action": action,
            }),
            format!(r#"action == HASH::Action::"{}""#, action.as_ref()),
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "action",
            }),
            "missing field `action`",
        );

        check_deserialization_error::<ActionConstraint>(
            json!({
                "type": "action",
                "action": action,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `action`",
        );
    }
}
