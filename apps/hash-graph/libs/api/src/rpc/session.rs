use graph_types::account::AccountId;

#[derive(Debug, Clone, Default)]
pub(crate) struct Account {
    pub actor_id: Option<AccountId>,
}
