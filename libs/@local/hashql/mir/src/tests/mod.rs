#![expect(
    unused,
    reason = "these are just builder methods, they are naturally (currently) unused"
)]
mod builder;

pub(crate) use self::builder::{
    BasicBlockBuilder, BodyBuilder, HasLocal, NoLocal, PlaceBuilder, RValueBuilder, SwitchBuilder,
    op, scaffold,
};

#[test]
fn it_works() {
    assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
}
