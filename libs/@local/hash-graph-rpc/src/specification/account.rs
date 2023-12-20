use authorization::schema::AccountGroupPermission;
use graph_types::account::{AccountGroupId, AccountId};

use crate::specification::service;

service!(pub service AccountService {
    option id = 1;
    option version = 2;

    rpc[id=1] CreateAccount() -> AccountId;
    rpc CreateAccountGroup() -> AccountGroupId;

    rpc CheckAccountGroupPermission(
        pub account_group_id: AccountGroupId,
        pub permission: AccountGroupPermission
    ) -> bool;

    rpc AddAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    );
    rpc RemoveAccountGroupMember(
        pub account_group_id: AccountGroupId,
        pub account_id: AccountId
    );
});
