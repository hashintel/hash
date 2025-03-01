use core::fmt;

use cedar_policy_core::{
    ast,
    entities::{Entities, TCComputation},
    extensions::Extensions,
};
use error_stack::{Report, ResultExt as _};

use super::{
    PolicyValidator,
    principal::{
        machine::Machine,
        user::User,
        web::{WebRole, WebTeam},
    },
    resource::{EntityResource, EntityTypeResource},
};

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ContextError {
    #[display("transitive closure computation failed")]
    TransitiveClosureError,
}

#[derive(Default)]
pub struct Context {
    entities: Entities,
}

impl fmt::Debug for Context {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.entities, fmt)
    }
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
    pub fn add_machine(&mut self, machine: &Machine) {
        self.entities.push(machine.to_cedar_entity());
    }

    pub fn add_user(&mut self, user: &User) {
        self.entities.push(user.to_cedar_entity());
    }

    pub fn add_web_team(&mut self, web_team: &WebTeam) {
        self.entities.push(web_team.to_cedar_entity());
    }

    pub fn add_web_role(&mut self, web_role: &WebRole) {
        self.entities.push(web_role.to_cedar_entity());
    }

    pub fn add_entity(&mut self, entity: &EntityResource) {
        self.entities.push(entity.to_cedar_entity());
    }

    pub fn add_entity_type(&mut self, entity_type: &EntityTypeResource) {
        self.entities.push(entity_type.to_cedar_entity());
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
                Some(&PolicyValidator::core_schema()),
                TCComputation::ComputeNow,
                Extensions::none(),
            )
            .change_context(ContextError::TransitiveClosureError)?,
        })
    }
}
