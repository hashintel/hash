#![feature(macro_metavar_expr_concat, allocator_api)]
extern crate alloc;

pub mod body;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
