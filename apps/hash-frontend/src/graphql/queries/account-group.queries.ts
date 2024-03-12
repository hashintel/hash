import { gql } from "@apollo/client";

export const addAccountGroupMemberMutation = gql`
  mutation addAccountGroupMember(
    $accountId: AccountId!
    $accountGroupId: AccountGroupId!
  ) {
    addAccountGroupMember(
      accountId: $accountId
      accountGroupId: $accountGroupId
    )
  }
`;

export const removeAccountGroupMemberMutation = gql`
  mutation removeAccountGroupMember(
    $accountId: AccountId!
    $accountGroupId: AccountGroupId!
  ) {
    removeAccountGroupMember(
      accountId: $accountId
      accountGroupId: $accountGroupId
    )
  }
`;
