use super::item::Item;
use crate::newtype;

newtype!(
    pub struct ImportId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Import<'heap> {
    pub id: ImportId,
    pub item: &'heap Item<'heap>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ImportMap<'heap> {
    pub imports: &'heap [Import<'heap>],
}
