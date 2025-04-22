use cedar_policy_core::ast;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not convert from Cedar Entity Reference")]
pub(crate) enum FromCedarRefernceError {
    #[display("Wrong entity type `{actual}`")]
    UnexpectedEntityType { actual: ast::EntityType },
    #[display("Could not convert from Cedar Entity ID")]
    InvalidCedarEntityId,
}
