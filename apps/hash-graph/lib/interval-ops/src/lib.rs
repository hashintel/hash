#![no_std]
// Not required, reason: code quality
#![feature(lint_reasons)]
#![feature(type_alias_impl_trait)]

extern crate alloc;

mod bounds;
mod interval;
mod interval_bounds;

pub use self::{
    bounds::{LowerBound, UpperBound},
    interval::Interval,
    interval_bounds::IntervalBounds,
};

#[inline(never)]
fn invalid_bounds() -> ! {
    panic!("interval lower bound must be less than or equal to its upper bound")
}
