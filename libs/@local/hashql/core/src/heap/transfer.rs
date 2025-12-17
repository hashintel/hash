use core::alloc;

use super::allocator::Allocator;

pub trait TransferInto<A: alloc::Allocator> {
    type Output;

    fn transfer_into(&self, allocator: A) -> Self::Output;
}
