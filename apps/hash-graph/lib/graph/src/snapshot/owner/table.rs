use graph_types::account::{AccountGroupId, AccountId};
use postgres_types::ToSql;

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: AccountId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "account_groups")]
pub struct AccountGroupRow {
    pub account_group_id: AccountGroupId,
}
