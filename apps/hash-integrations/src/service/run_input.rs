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
    #[display("the run's definition is not a valid definition")]
    InvalidDefinition,
    #[display("the run's definition names another connector than the run was started for")]
    ConnectorMismatch,
}

impl RunInput {
    /// Checks the run belongs to `web`, then parses the recorded definition and checks it names
    /// the run's connector.
    ///
    /// # Errors
    ///
    /// - [`RunInputError::WebMismatch`] if the run was started for another web.
    /// - [`RunInputError::InvalidDefinition`] if the definition is not a valid definition.
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
    use similar_asserts::assert_eq;
    use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
    use uuid::uuid;

    use super::{Invocation, RunInput, RunInputError};

    fn input(definition: &str) -> RunInput {
        RunInput {
            web: WebId::new(uuid!("00000000-0000-4000-8000-000000000001")),
            connector: "demo".into(),
            owner: ActorEntityUuid::new(uuid!("00000000-0000-4000-8000-000000000002")),
            definition: definition.into(),
            invocation: Invocation { links_only: false },
        }
    }

    #[test]
    fn definition_matching() {
        let input = input("connector: demo\n");

        let definition = input
            .definition(input.web)
            .expect("should parse the definition of the run's web and connector");

        assert_eq!(definition.connector().as_ref(), "demo");
    }

    #[test]
    fn definition_other_web() {
        let other = WebId::new(uuid!("00000000-0000-4000-8000-000000000003"));

        let report = input("connector: demo\n")
            .definition(other)
            .expect_err("should reject a run started for another web");

        assert_eq!(*report.current_context(), RunInputError::WebMismatch);
    }

    /// The definition names another connector than the one the run was admitted under.
    #[test]
    fn definition_other_connector() {
        let input = input("connector: other\n");

        let report = input
            .definition(input.web)
            .expect_err("should reject a definition of another connector");

        assert_eq!(*report.current_context(), RunInputError::ConnectorMismatch);
    }
}
