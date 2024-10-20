use error_stack::Report;
use graph_types::account::AccountId;
use harpc_server::session::Session;

use super::{role, session::User};

pub struct AuthenticationError;

pub trait AuthenticationService<R>
where
    R: role::Role,
{
    async fn authenticate(
        &self,
        session: R::Session,
        actor_id: AccountId,
    ) -> Result<(), Report<AuthenticationError>>;
}

pub struct AuthenticationServer;

impl AuthenticationService<role::Server> for AuthenticationServer {
    async fn authenticate(
        &self,
        session: Session<User>,
        actor_id: AccountId,
    ) -> Result<(), Report<AuthenticationError>> {
        session.update(User {
            actor_id: Some(actor_id),
        });

        Ok(())
    }
}
