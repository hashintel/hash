use uuid::Uuid;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ActorId(Uuid);

impl From<Uuid> for ActorId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}
