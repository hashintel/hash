use type_system::principal::actor::ActorEntityUuid;

#[derive(Debug, Clone, Default)]
pub struct Account {
    pub actor_id: Option<ActorEntityUuid>,
}
