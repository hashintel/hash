#![no_std]

extern crate alloc;

pub(crate) mod array;
mod deserializer;
pub(crate) mod object;
pub(crate) mod tape;
mod token;

pub fn add(left: usize, right: usize) -> usize {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}
