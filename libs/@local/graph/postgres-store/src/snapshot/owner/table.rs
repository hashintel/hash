use hash_graph_authorization::schema::AccountGroupId;
use postgres_types::ToSql;
use type_system::provenance::ActorId;

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: ActorId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "account_groups")]
pub struct AccountGroupRow {
    pub account_group_id: AccountGroupId,
}
