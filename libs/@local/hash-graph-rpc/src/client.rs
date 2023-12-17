use std::marker::PhantomData;

use crate::{
    rpc::{RemoteProcedure, ServiceSpecification},
    types::Includes,
};

pub struct Client<T> {
    _service: PhantomData<T>,
}

impl<T> Client<T>
where
    T: ServiceSpecification,
{
    pub fn new() -> Self {
        Self {
            _service: PhantomData,
        }
    }

    pub async fn call<P>(&self, request: P) -> P::Response
    where
        P: RemoteProcedure,
        T::Procedures: Includes<P>,
    {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use authorization::schema::AccountGroupPermission;
    use graph_types::account::{AccountGroupId, AccountId};
    use uuid::Uuid;

    use crate::{
        client::Client,
        specification::account::{
            AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
        },
    };

    struct DifferentProcedure;
    impl crate::rpc::RemoteProcedure for DifferentProcedure {
        type Response = ();

        const ID: crate::rpc::ProcedureId = crate::rpc::ProcedureId::derive("DifferentProcedure");
    }

    async fn _never_called() {
        let client = Client::<AccountService>::new();

        let response = client.call(CreateAccount).await;

        let response = client
            .call(AddAccountGroupMember {
                account_group_id: AccountGroupId::new(Uuid::new_v4()),
                account_id: AccountId::new(Uuid::new_v4()),
            })
            .await;

        let response = client
            .call(CheckAccountGroupPermission {
                account_group_id: AccountGroupId::new(Uuid::new_v4()),
                permission: AccountGroupPermission::AddMember,
            })
            .await;

        let response = client.call(DifferentProcedure).await;
    }

    #[test]
    fn compile() {}
}
