use hashql_core::id;

id::newtype!(
    /// A unique identifier for definitions that have a body associated with them in the HashQL MIR.
    ///
    /// The value space is restricted to `0..=0xFFFF_FF00`, reserving the last 256 for niches.
    pub struct DefId(u32 is 0..=0xFFFF_FF00)
);

impl DefId {
    pub const LIST_PUSH: Self = Self(0xFFFF_FE00);
    pub const LIST_PUSH_MUT: Self = Self(0xFFFF_FE01);
}

impl DefId {
    pub const LIST_POP: Self = Self(0xFFFF_FE02);
    pub const LIST_POP_MUT: Self = Self(0xFFFF_FE03);
}

impl DefId {
    pub const DICT_INSERT: Self = Self(0xFFFF_FE04);
    pub const DICT_INSERT_MUT: Self = Self(0xFFFF_FE05);
}

impl DefId {
    pub const DICT_REMOVE: Self = Self(0xFFFF_FE06);
    pub const DICT_REMOVE_MUT: Self = Self(0xFFFF_FE07);
}
