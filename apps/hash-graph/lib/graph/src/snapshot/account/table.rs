use postgres_types::ToSql;

use crate::identifier::account::AccountId;

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: AccountId,
}
