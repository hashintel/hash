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
        team::Team,
        user::User,
        web::{Web, WebRole, WebTeam},
    },
    resource::{EntityResource, EntityTypeResource, Resource},
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

    pub fn add_resource(&mut self, resource: &Resource) {
        self.entities.push(resource.to_cedar_entity());
    }

    pub fn add_entity(&mut self, entity: &EntityResource) {
        self.entities.push(entity.to_cedar_entity());
    }

    pub fn add_entity_type(&mut self, entity_type: &EntityTypeResource) {
        self.entities.push(entity_type.to_cedar_entity());
    }

    pub fn add_web(&mut self, web: &Web) {
        self.entities.push(web.to_cedar_entity());
    }

    pub fn add_team(&mut self, team: &Team) {
        self.entities.push(team.to_cedar_entity());
    }

    pub fn add_web_team(&mut self, web_team: &WebTeam) {
        self.entities.push(web_team.to_cedar_entity());
    }

    pub fn add_web_role(&mut self, web_role: &WebRole) {
        self.entities.push(web_role.to_cedar_entity());
    }

    #[must_use]
    pub fn with_user(mut self, user: &User) -> Self {
        self.add_user(user);
        self
    }

    #[must_use]
    pub fn with_machine(mut self, machine: &Machine) -> Self {
        self.add_machine(machine);
        self
    }

    #[must_use]
    pub fn with_resource(mut self, resource: &Resource) -> Self {
        self.add_resource(resource);
        self
    }

    #[must_use]
    pub fn with_web(mut self, web: &Web) -> Self {
        self.add_web(web);
        self
    }

    #[must_use]
    pub fn with_web_role(mut self, web_role: &WebRole) -> Self {
        self.add_web_role(web_role);
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
                Some(&PolicyValidator::core_schema()),
                TCComputation::ComputeNow,
                Extensions::none(),
            )
            .change_context(ContextError::TransitiveClosureError)?,
        })
    }
}
