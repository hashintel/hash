use alloc::borrow::Cow;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::id::EntityEditionId, ontology::VersionedUrl, principal::actor::ActorId,
};

use super::{
    Context, ContextBuilder, PolicySet,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    store::{PolicyStore, PrincipalStore, error::ContextCreationError},
};

#[derive(Debug)]
pub struct PolicyComponents {
    pub actor_id: Option<ActorId>,
    pub policy_set: PolicySet,
    pub context: Context,
}

impl PolicyComponents {
    #[must_use]
    pub fn builder<S>(store: &S) -> PolicyComponentsBuilder<'_, S> {
        PolicyComponentsBuilder::new(store)
    }
}

pub struct PolicyComponentsBuilder<'a, S> {
    store: &'a S,
    actor: AuthenticatedActor,
    context: ContextBuilder,
    entity_type_ids: HashSet<Cow<'a, VersionedUrl>>,
    entity_edition_ids: HashSet<EntityEditionId>,
    actions: HashSet<ActionName>,
}

impl<'a, S> PolicyComponentsBuilder<'a, S> {
    #[must_use]
    pub fn new(store: &'a S) -> Self {
        Self {
            store,
            actor: AuthenticatedActor::Public,
            context: ContextBuilder::default(),
            entity_type_ids: HashSet::new(),
            entity_edition_ids: HashSet::new(),
            actions: HashSet::new(),
        }
    }

    pub fn set_actor(&mut self, actor: impl Into<AuthenticatedActor>) {
        self.actor = actor.into();
    }

    #[must_use]
    pub fn with_actor(mut self, actor: impl Into<AuthenticatedActor>) -> Self {
        self.set_actor(actor);
        self
    }

    pub fn add_entity_type_id(&mut self, entity_type: &'a VersionedUrl) {
        self.entity_type_ids.insert(Cow::Borrowed(entity_type));
    }

    pub fn add_entity_type_ids(&mut self, entity_type: impl IntoIterator<Item = &'a VersionedUrl>) {
        self.entity_type_ids
            .extend(entity_type.into_iter().map(Cow::Borrowed));
    }

    #[must_use]
    pub fn with_entity_type_id(mut self, entity_type: &'a VersionedUrl) -> Self {
        self.add_entity_type_id(entity_type);
        self
    }

    #[must_use]
    pub fn with_entity_type_ids(
        mut self,
        entity_types: impl IntoIterator<Item = &'a VersionedUrl>,
    ) -> Self {
        self.add_entity_type_ids(entity_types);
        self
    }

    pub fn add_entity_edition_id(&mut self, entity_edition_id: EntityEditionId) {
        self.entity_edition_ids.insert(entity_edition_id);
    }

    pub fn add_entity_edition_ids(
        &mut self,
        entity_edition_ids: impl IntoIterator<Item = EntityEditionId>,
    ) {
        self.entity_edition_ids.extend(entity_edition_ids);
    }

    #[must_use]
    pub fn with_entity_edition_id(mut self, entity_edition_id: EntityEditionId) -> Self {
        self.add_entity_edition_id(entity_edition_id);
        self
    }

    #[must_use]
    pub fn with_entity_edition_ids(
        mut self,
        entity_edition_ids: impl IntoIterator<Item = EntityEditionId>,
    ) -> Self {
        self.add_entity_edition_ids(entity_edition_ids);
        self
    }

    pub fn add_action(&mut self, action: ActionName) {
        self.actions.insert(action);
    }

    pub fn add_actions(&mut self, actions: impl IntoIterator<Item = ActionName>) {
        self.actions.extend(actions);
    }

    #[must_use]
    pub fn with_action(mut self, action: ActionName) -> Self {
        self.add_action(action);
        self
    }

    #[must_use]
    pub fn with_actions(mut self, actions: impl IntoIterator<Item = ActionName>) -> Self {
        self.add_actions(actions);
        self
    }
}

impl<S> IntoFuture for PolicyComponentsBuilder<'_, S>
where
    S: PrincipalStore + PolicyStore + Sync,
{
    type Output = Result<PolicyComponents, Report<ContextCreationError>>;

    type IntoFuture = impl Future<Output = Self::Output> + Send;

    fn into_future(mut self) -> Self::IntoFuture {
        async move {
            let actor_id = match self.actor {
                AuthenticatedActor::Public => None,
                AuthenticatedActor::Id(actor_id) => Some(actor_id),
                AuthenticatedActor::Uuid(actor_uuid) => self
                    .store
                    .determine_actor(actor_uuid)
                    .await
                    .change_context(ContextCreationError::DetermineActor {
                        actor_id: actor_uuid,
                    })?,
            };

            if let Some(actor_id) = actor_id {
                self.store
                    .build_principal_context(actor_id, &mut self.context)
                    .await
                    .change_context(ContextCreationError::BuildPrincipalContext { actor_id })?;
            } else {
                self.context.add_public_actor();
            }

            let entity_resources;
            let mut entity_type_ids = self.entity_type_ids;
            if !self.entity_edition_ids.is_empty() {
                entity_resources = self
                    .store
                    .build_entity_context(
                        &self.entity_edition_ids.iter().copied().collect::<Vec<_>>(),
                    )
                    .await
                    .change_context(ContextCreationError::BuildEntityContext {
                        entity_edition_ids: self.entity_edition_ids,
                    })?;
                for entity_resource in &entity_resources {
                    self.context.add_entity(entity_resource);
                    entity_type_ids.extend(entity_resource.entity_type.iter().map(Cow::Borrowed));
                }
            }

            if !entity_type_ids.is_empty() {
                let entity_type_ids = entity_type_ids.iter().map(Cow::as_ref).collect::<Vec<_>>();
                let entity_type_resources = self
                    .store
                    .build_entity_type_context(&entity_type_ids)
                    .await
                    .change_context_lazy(|| ContextCreationError::BuildEntityTypeContext {
                        entity_type_ids: entity_type_ids.into_iter().cloned().collect(),
                    })?;
                for entity_type_resource in &entity_type_resources {
                    self.context.add_entity_type(entity_type_resource);
                }
            }

            let actions = self.actions.iter().copied().collect::<Vec<_>>();
            let policies = if actions.is_empty() {
                Vec::new()
            } else {
                self.store
                    .resolve_policies_for_actor(self.actor, actor_id, &actions)
                    .await
                    .change_context(ContextCreationError::ResolveActorPolicies { actor_id })?
            };

            Ok(PolicyComponents {
                actor_id,
                policy_set: PolicySet::default()
                    .with_tracked_actions(self.actions)
                    .with_policies(&policies)
                    .change_context(ContextCreationError::CreatePolicySet)?,
                context: self
                    .context
                    .build()
                    .change_context(ContextCreationError::CreatePolicyContext)?,
            })
        }
    }
}
