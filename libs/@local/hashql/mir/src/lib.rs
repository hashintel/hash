#![feature(macro_metavar_expr_concat, allocator_api, if_let_guard)]
#![expect(clippy::indexing_slicing)]
extern crate alloc;

pub mod body;
pub mod def;
pub mod intern;
pub mod reify;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
