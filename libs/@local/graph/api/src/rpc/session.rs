use type_system::provenance::ActorEntityUuid;

#[derive(Debug, Clone, Default)]
pub struct Account {
    pub actor_id: Option<ActorEntityUuid>,
}
