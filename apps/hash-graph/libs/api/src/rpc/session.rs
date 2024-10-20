use graph_types::account::AccountId;

#[derive(Debug, Clone)]
pub struct User {
    pub actor_id: Option<AccountId>,
}
