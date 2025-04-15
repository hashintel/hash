pub use self::{
    batch::AccountRowBatch,
    channel::{OwnerSender, channel},
};

mod batch;
mod channel;

use crate::snapshot::AccountGroup;

pub enum Owner {
    AccountGroup(AccountGroup),
}
