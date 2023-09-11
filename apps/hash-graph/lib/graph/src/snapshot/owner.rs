mod batch;
mod channel;
mod table;

use graph_types::account::{AccountGroupId, AccountId};

pub use self::{
    batch::AccountRowBatch,
    channel::{channel, OwnerReceiver, OwnerSender},
    table::{AccountGroupRow, AccountRow},
};

pub enum OwnerId {
    Account(AccountId),
    AccountGroup(AccountGroupId),
}
