use authorization::schema::AccountGroupPermission;
use graph_types::account::{AccountGroupId, AccountId};

use crate::specification::service;

service!(pub service AccountService {
    option id = 0x00;
    option version = 0x00;

    rpc[id=0x00] CreateAccount() -> AccountId;
    rpc[id=0x01] CreateAccountGroup() -> AccountGroupId;

    rpc[id=0x02] CheckAccountGroupPermission(
        pub account_group_id: AccountGroupId,
        pub permission: AccountGroupPermission
    ) -> bool;

    rpc[id=0x03] AddAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    );
    rpc[id=0x04] RemoveAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    );
});
