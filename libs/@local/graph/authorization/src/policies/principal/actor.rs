use super::{machine::Machine, user::User};

#[derive(Debug)]
pub enum Actor {
    User(User),
    Machine(Machine),
}
