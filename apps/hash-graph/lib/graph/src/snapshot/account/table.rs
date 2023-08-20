use graph_types::account::AccountId;
use postgres_types::ToSql;

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: AccountId,
}
