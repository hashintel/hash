use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Authorization {
    user: Uuid,
}
