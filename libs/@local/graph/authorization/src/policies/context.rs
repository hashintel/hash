use core::fmt;
use std::collections::HashSet;

use cedar_policy_core::{
    ast,
    entities::{Entities, TCComputation},
    extensions::Extensions,
};
use error_stack::{Report, ResultExt as _};
use type_system::principal::{Actor, ActorGroup, Role};

use super::{
    PolicyValidator,
    cedar::ToCedarEntity as _,
    principal::actor::PublicActor,
    resource::{
        DataTypeResource, EntityResource, EntityTypeResource, PolicyMetaResource,
        PropertyTypeResource,
    },
};

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ContextError {
    #[display("transitive closure computation failed")]
    TransitiveClosureError,
}

#[derive(Default, derive_more::Display)]
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
    /// Team names the actor belongs to (for checking instance admin status).
    actor_team_names: HashSet<String>,
}

impl ContextBuilder {
    /// Adds an actor to the context for policy evaluation.
    ///
    /// This allows the actor to be identified as a principal during authorization,
    /// making it available for matching against principal constraints in policies.
    pub fn add_actor(&mut self, actor: &Actor) {
        self.entities.push(actor.to_cedar_entity());
    }

    /// Adds the public actor to the context for policy evaluation.
    ///
    /// This allows the actor to be identified as a principal during authorization,
    /// making it available for matching against principal constraints in policies.
    pub fn add_public_actor(&mut self) {
        self.entities.push(PublicActor.to_cedar_entity());
    }

    /// Adds an actor group to the context for policy evaluation.
    ///
    /// This allows policies associated with the actor group to be considered during authorization,
    /// making the actor group available as a potential principal in the Cedar evaluation context.
    pub fn add_actor_group(&mut self, actor_group: &ActorGroup) {
        if let ActorGroup::Team(team) = actor_group {
            self.actor_team_names.insert(team.name.clone());
        }
        self.entities.push(actor_group.to_cedar_entity());
    }

    #[must_use]
    pub fn is_instance_admin(&self) -> bool {
        self.actor_team_names.contains("instance-admins")
    }

    /// Adds a role to the context for policy evaluation.
    ///
    /// This allows policies associated with the role to be considered during authorization,
    /// enabling role-based access control as part of the Cedar evaluation context.
    pub fn add_role(&mut self, role: &Role) {
        self.entities.push(role.to_cedar_entity());
    }

    pub fn add_entity(&mut self, entity: &EntityResource) {
        self.entities.push(entity.to_cedar_entity());
    }

    pub fn add_entity_type(&mut self, entity_type: &EntityTypeResource) {
        self.entities.push(entity_type.to_cedar_entity());
    }

    pub fn add_property_type(&mut self, property_type: &PropertyTypeResource) {
        self.entities.push(property_type.to_cedar_entity());
    }

    pub fn add_data_type(&mut self, data_type: &DataTypeResource) {
        self.entities.push(data_type.to_cedar_entity());
    }

    pub fn add_policy_meta_resource(&mut self, policy_resource: &PolicyMetaResource) {
        self.entities.push(policy_resource.to_cedar_entity());
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
