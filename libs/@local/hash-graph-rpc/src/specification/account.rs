use authorization::schema::AccountGroupPermission;
use graph_types::account::{AccountGroupId, AccountId};

use crate::specification::{common::Error, service};

service!(pub service AccountService {
    option id = 0x00;
    option version = 0x00;

    rpc[id=0x00] CreateAccount() -> Result<AccountId, Error>;
    rpc[id=0x01] CreateAccountGroup() -> Result<AccountGroupId, Error>;

    rpc[id=0x02] CheckAccountGroupPermission(
        pub account_group_id: AccountGroupId,
        pub permission: AccountGroupPermission
    ) -> Result<bool, Error>;

    rpc[id=0x03] AddAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    ) -> Result<(), Error>;
    rpc[id=0x04] RemoveAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    ) -> Result<(), Error>;
});
