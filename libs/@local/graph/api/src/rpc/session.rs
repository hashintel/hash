use hash_graph_types::account::AccountId;

#[derive(Debug, Clone, Default)]
pub struct Account {
    pub actor_id: Option<AccountId>,
}
