use graph_types::account::AccountId;

#[derive(Debug, Clone, Default)]
pub(crate) struct User {
    pub actor_id: Option<AccountId>,
}
