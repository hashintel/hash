use error_stack::{Report, ResultExt as _, bail};
use hash_integrations_definition::Definition;
use serde::{Deserialize, Serialize};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};

/// How a run was asked for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Invocation {
    pub links_only: bool,
}

/// What a run records when it starts: the definition as written, and who started it for which
/// integration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RunInput {
    pub web: WebId,
    pub connector: Box<str>,
    pub owner: ActorEntityUuid,
    pub definition: Box<str>,
    pub invocation: Invocation,
}

/// Why the worker rejects a run's input.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum RunInputError {
    #[display("the run was started for another web")]
    WebMismatch,
    #[display("the run's definition does not parse")]
    InvalidDefinition,
    #[display("the run's definition names another connector than the run was started for")]
    ConnectorMismatch,
}

impl RunInput {
    /// Parses the recorded definition after checking the run belongs to `web` and its connector.
    ///
    /// # Errors
    ///
    /// - [`RunInputError::WebMismatch`] if the run was started for another web.
    /// - [`RunInputError::InvalidDefinition`] if the definition does not parse.
    /// - [`RunInputError::ConnectorMismatch`] if the definition names another connector.
    pub(crate) fn definition(&self, web: WebId) -> Result<Definition, Report<RunInputError>> {
        if self.web != web {
            bail!(RunInputError::WebMismatch);
        }

        let definition = Definition::from_yaml(&self.definition)
            .change_context(RunInputError::InvalidDefinition)?;

        if definition.connector().as_ref() != &*self.connector {
            bail!(RunInputError::ConnectorMismatch);
        }

        Ok(definition)
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    const DEFINITION: &str = "connector: demo\n";

    fn input(definition: &str) -> RunInput {
        RunInput {
            web: WebId::new(Uuid::from_u128(1)),
            connector: "demo".into(),
            owner: ActorEntityUuid::new(Uuid::from_u128(2)),
            definition: definition.into(),
            invocation: Invocation { links_only: false },
        }
    }

    #[test]
    fn definition_parses_for_its_web_and_connector() {
        let input = input(DEFINITION);

        let definition = input
            .definition(input.web)
            .expect("the definition should parse");

        assert_eq!(definition.connector().as_ref(), "demo");
    }

    #[test]
    fn definition_rejects_another_web() {
        let report = input(DEFINITION)
            .definition(WebId::new(Uuid::from_u128(3)))
            .expect_err("another web should be rejected");

        assert_eq!(*report.current_context(), RunInputError::WebMismatch);
    }

    #[test]
    fn definition_rejects_text_that_does_not_parse() {
        let input = input("connector: \"demo\n");

        let report = input
            .definition(input.web)
            .expect_err("the definition should not parse");

        assert_eq!(*report.current_context(), RunInputError::InvalidDefinition);
    }

    #[test]
    fn definition_rejects_another_connector() {
        let input = input("connector: other\n");

        let report = input
            .definition(input.web)
            .expect_err("another connector should be rejected");

        assert_eq!(*report.current_context(), RunInputError::ConnectorMismatch);
    }
}
