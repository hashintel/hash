pub mod account;
pub mod auth;
mod session;

mod role {
    use harpc_client::connection::Connection;
    use harpc_server::session::Session;
    pub(crate) use harpc_service::role::Role;

    use super::session::User;

    pub(crate) type Server = harpc_service::role::Server<Session<User>>;
    pub(crate) type Client<Svc, C> = harpc_service::role::Client<Connection<Svc, C>>;
}
