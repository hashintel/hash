use authorization::schema::AccountGroupPermission;
use graph_types::account::{AccountGroupId, AccountId};

use crate::specification::service;

pub struct CheckAccountGroupPermissionRequest {
    account_group_id: AccountGroupId,
    permission: AccountGroupPermission,
}

pub struct AddAccountGroupMemberRequest {
    account_group_id: AccountGroupId,
    account_id: AccountId,
}

pub struct RemoveAccountGroupMemberRequest {
    account_group_id: AccountGroupId,
    account_id: AccountId,
}

service!(pub service AccountService {
    rpc CreateAccount() -> AccountId;
    rpc CreateAccountGroup() -> AccountGroupId;

    rpc CheckAccountGroupPermission(CheckAccountGroupPermissionRequest) -> bool;

    rpc AddAccountGroupMember(AddAccountGroupMemberRequest);
    rpc RemoveAccountGroupMember(RemoveAccountGroupMemberRequest);
});
