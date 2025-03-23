//! The AST pointer.
//!
//! Provides [`P<T>`][struct@P], an owned smart pointer.
//!
//! # Motivations and benefits
//!
//! * **Identity**: sharing AST nodes is problematic for the various analysis passes (e.g., one may
//!   be able to bypass the borrow checker with a shared `ExprKind::AddrOf` node taking a mutable
//!   borrow).
//!
//! * **Efficiency**: folding can reuse allocation space for `P<T>` and `Vec<T>`, the latter even
//!   when the input and output types differ (as it would be the case with heaps or a GADT AST using
//!   type parameters to toggle features).
//!
//! * **Maintainability**: `P<T>` provides an interface, which can remain fully functional even if
//!   the implementation changes (using a special thread-local heap, for example). Moreover, a
//!   switch to, e.g., `P<'a, T>` would be easy and mostly automated.
//!
//! Adapted from <https://github.com/rust-lang/rust/blob/master/compiler/rustc_ast/src/ptr.rs>

use core::{
    fmt::{self, Debug, Display},
    ops::{Deref, DerefMut},
};

use super::Heap;

/// An owned smart pointer.
///
/// See the [module level documentation][crate::ptr] for details.
pub struct P<'heap, T: ?Sized> {
    ptr: alloc::boxed::Box<T, &'heap Heap>,
}

impl<'heap, T: 'static> P<'heap, T> {
    pub fn new(value: T, heap: &'heap Heap) -> Self {
        P {
            ptr: alloc::boxed::Box::new_in(value, heap),
        }
    }

    /// Move out of the pointer.
    /// Intended for chaining transformations not covered by `map`.
    pub fn and_then<U, F>(self, f: F) -> U
    where
        F: FnOnce(T) -> U,
    {
        f(*self.ptr)
    }

    /// Equivalent to `and_then(|x| x)`.
    pub fn into_inner(self) -> T {
        *self.ptr
    }

    /// Produce a new `P<T>` from `self` without reallocating.
    pub fn map<F>(mut self, f: F) -> P<'heap, T>
    where
        F: FnOnce(T) -> T,
    {
        let x = f(*self.ptr);
        *self.ptr = x;

        self
    }

    /// Optionally produce a new `P<T>` from `self` without reallocating.
    pub fn filter_map<F>(mut self, f: F) -> Option<P<'heap, T>>
    where
        F: FnOnce(T) -> Option<T>,
    {
        *self.ptr = f(*self.ptr)?;
        Some(self)
    }
}

impl<'heap, T> P<'heap, [T]> {
    pub fn empty(heap: &'heap Heap) -> P<'heap, [T]> {
        P {
            ptr: Box::new_in([], heap),
        }
    }

    pub fn from_vec(vec: super::Vec<'heap, T>) -> P<'heap, [T]> {
        P {
            ptr: vec.into_boxed_slice(),
        }
    }

    pub fn into_vec(self) -> super::Vec<'heap, T> {
        self.ptr.into_vec()
    }
}

impl<'heap, T: ?Sized> Deref for P<'heap, T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.ptr
    }
}

impl<'heap, T: ?Sized> DerefMut for P<'heap, T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut self.ptr
    }
}

impl<'heap, T: Clone + 'static> Clone for P<'heap, T> {
    fn clone(&self) -> P<'heap, T> {
        P::new((**self).clone(), *Box::allocator(&self.ptr))
    }
}

impl<'heap, T: ?Sized + Debug> Debug for P<'heap, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.ptr, f)
    }
}

impl<'heap, T: Display> Display for P<'heap, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<'heap, T> fmt::Pointer for P<'heap, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Pointer::fmt(&self.ptr, f)
    }
}
