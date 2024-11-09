pub use self::{
    batch::AccountRowBatch,
    channel::{OwnerReceiver, OwnerSender, channel},
    table::{AccountGroupRow, AccountRow},
};

mod batch;
mod channel;
mod table;

use crate::snapshot::{Account, AccountGroup};

pub enum Owner {
    Account(Account),
    AccountGroup(AccountGroup),
}
