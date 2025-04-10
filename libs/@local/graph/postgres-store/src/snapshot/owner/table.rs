use postgres_types::ToSql;
use type_system::{provenance::ActorEntityUuid, web::ActorGroupEntityUuid};

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: ActorEntityUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "account_groups")]
pub struct AccountGroupRow {
    pub account_group_id: ActorGroupEntityUuid,
}
