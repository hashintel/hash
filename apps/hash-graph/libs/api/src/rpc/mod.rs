mod account;
mod auth;
mod session;

mod role {
    use harpc_server::session::Session;
    pub(crate) use harpc_service::role::Role;

    use super::session::User;

    pub(crate) type Server = harpc_service::role::Server<Session<User>>;
}
