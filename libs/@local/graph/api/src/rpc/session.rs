use type_system::provenance::UntaggedActorId;

#[derive(Debug, Clone, Default)]
pub struct Account {
    pub actor_id: Option<UntaggedActorId>,
}
