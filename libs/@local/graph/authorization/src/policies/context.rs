use cedar_policy_core::{
    ast,
    entities::{Entities, TCComputation},
    extensions::Extensions,
};
use error_stack::{Report, ResultExt as _};

use super::{Validator, principal::Actor, resource::Resource};

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ContextError {
    #[display("transitive closure computation failed")]
    TransitiveClosureError,
}

#[derive(Debug, Default)]
pub struct Context {
    entities: Entities,
}

impl Context {
    #[must_use]
    pub(crate) const fn entities(&self) -> &Entities {
        &self.entities
    }
}

#[derive(Debug, Default)]
pub struct ContextBuilder {
    entities: Vec<ast::Entity>,
}

impl ContextBuilder {
    #[must_use]
    pub fn with_actor(mut self, actor: &Actor) -> Self {
        self.entities.push(actor.to_cedar_entity());
        self
    }

    #[must_use]
    pub fn with_resource(mut self, resource: &Resource) -> Self {
        self.entities.push(resource.to_cedar_entity());
        self
    }

    /// Builds the context.
    ///
    /// It will compute the transitive closure of the entities in the context.
    ///
    /// # Errors
    ///
    /// - [`ContextError::TransitiveClosureError`] if the transitive closure computation fails.
    pub fn build(self) -> Result<Context, Report<ContextError>> {
        Ok(Context {
            entities: Entities::from_entities(
                self.entities,
                Some(&Validator::core_schema()),
                TCComputation::ComputeNow,
                Extensions::none(),
            )
            .change_context(ContextError::TransitiveClosureError)?,
        })
    }
}
