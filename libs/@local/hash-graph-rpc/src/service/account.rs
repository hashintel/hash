use graph_types::account::AccountId;

#[tarpc::service(derive_serde = false)]
pub trait Account {
    async fn create() -> AccountId;

    async fn delete(id: AccountId);
}

#[tarpc::service]
pub trait AccountGroup {
    async fn create() -> AccountId;
}
