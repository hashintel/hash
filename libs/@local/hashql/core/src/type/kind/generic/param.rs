use super::GenericArgumentId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}
