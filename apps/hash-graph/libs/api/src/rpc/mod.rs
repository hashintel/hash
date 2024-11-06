pub mod account;
pub mod auth;
pub mod echo;
mod session;

mod role {
    use harpc_client::connection::Connection;
    use harpc_server::session::Session;
    pub(crate) use harpc_service::role::Role;

    use super::session::Account;

    pub(crate) type Server = harpc_service::role::Server<Session<Account>>;
    pub(crate) type Client<Svc, C> = harpc_service::role::Client<Connection<Svc, C>>;
}
