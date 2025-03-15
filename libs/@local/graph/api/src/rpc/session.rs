use type_system::provenance::ActorId;

#[derive(Debug, Clone, Default)]
pub struct Account {
    pub actor_id: Option<ActorId>,
}
