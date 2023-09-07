use authorization::zanzibar::{Affiliation, Permission, Relation, Resource};

#[derive(Debug, Copy, Clone)]
pub struct Account(&'static str);

pub const ALICE: Account = Account("alice");
pub const BOB: Account = Account("bob");
pub const CHARLIE: Account = Account("charlie");

impl Resource for Account {
    type Id = str;

    fn namespace(&self) -> &'static str {
        "graph/account"
    }

    fn id(&self) -> &'static str {
        self.0
    }
}

#[derive(Debug, Copy, Clone)]
pub struct Entity(&'static str);

pub const ENTITY_A: Entity = Entity("a");
pub const ENTITY_B: Entity = Entity("b");
pub const ENTITY_C: Entity = Entity("c");

impl Resource for Entity {
    type Id = str;

    fn namespace(&self) -> &'static str {
        "graph/entity"
    }

    fn id(&self) -> &'static str {
        self.0
    }
}

pub enum EntityRelation {
    Writer,
    Reader,
}

impl AsRef<str> for EntityRelation {
    fn as_ref(&self) -> &str {
        match self {
            Self::Writer => "writer",
            Self::Reader => "reader",
        }
    }
}

impl Affiliation<Entity> for EntityRelation {}
impl Relation<Entity> for EntityRelation {}

pub enum EntityPermission {
    Edit,
    View,
}

impl AsRef<str> for EntityPermission {
    fn as_ref(&self) -> &str {
        match self {
            Self::Edit => "edit",
            Self::View => "view",
        }
    }
}

impl Affiliation<Entity> for EntityPermission {}
impl Permission<Entity> for EntityPermission {}
