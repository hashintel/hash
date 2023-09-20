use std::fmt::Display;

use authorization::zanzibar::{Affiliation, Permission, Relation, Resource};
use serde::Serialize;

#[derive(Debug, Copy, Clone)]
pub struct Account(&'static str);

pub const ALICE: Account = Account("alice");
pub const BOB: Account = Account("bob");

impl Resource for Account {
    type Id = str;

    fn namespace() -> &'static str {
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

impl Resource for Entity {
    type Id = str;

    fn namespace() -> &'static str {
        "graph/entity"
    }

    fn id(&self) -> &'static str {
        self.0
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityRelation {
    Writer,
    Reader,
}

impl Display for EntityRelation {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<Entity> for EntityRelation {}
impl Relation<Entity> for EntityRelation {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    Edit,
    View,
}

impl Display for EntityPermission {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<Entity> for EntityPermission {}
impl Permission<Entity> for EntityPermission {}
