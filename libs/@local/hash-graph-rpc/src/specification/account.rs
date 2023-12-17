use authorization::schema::AccountGroupPermission;
use graph_types::account::{AccountGroupId, AccountId};

use crate::specification::service;

service!(pub service AccountService {
    rpc CreateAccount() -> AccountId;
    rpc CreateAccountGroup() -> AccountGroupId;

    rpc CheckAccountGroupPermission(
        account_group_id: AccountGroupId,
        permission: AccountGroupPermission
    ) -> bool;

    rpc AddAccountGroupMember(
        account_group_id: AccountGroupId,
        account_id: AccountId
    );
    rpc RemoveAccountGroupMember(
        account_group_id: AccountGroupId,
        account_id: AccountId
    );
});
