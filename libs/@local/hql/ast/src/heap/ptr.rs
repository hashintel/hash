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
#[derive(PartialEq, Eq, Hash)]
pub struct P<'heap, T: ?Sized> {
    ptr: alloc::boxed::Box<T, &'heap Heap>,
}

impl<'heap, T: 'heap> P<'heap, T> {
    pub fn new(value: T, heap: &'heap Heap) -> Self {
        P {
            ptr: alloc::boxed::Box::new_in(value, heap),
        }
    }

    /// Move out of the pointer.
    /// Intended for chaining transformations not covered by `map`.
    pub fn and_then<U, F>(self, func: F) -> U
    where
        F: FnOnce(T) -> U,
    {
        func(*self.ptr)
    }

    /// Equivalent to `and_then(|x| x)`.
    #[must_use]
    pub fn into_inner(self) -> T {
        *self.ptr
    }

    /// Produce a new `P<T>` from `self` without reallocating.
    #[must_use]
    pub fn map<F>(mut self, func: F) -> Self
    where
        F: FnOnce(T) -> T,
    {
        let x = func(*self.ptr);
        *self.ptr = x;

        self
    }

    /// Optionally produce a new `P<T>` from `self` without reallocating.
    pub fn filter_map<F>(mut self, func: F) -> Option<Self>
    where
        F: FnOnce(T) -> Option<T>,
    {
        *self.ptr = func(*self.ptr)?;
        Some(self)
    }
}

impl<'heap, T> P<'heap, [T]> {
    pub fn empty(heap: &'heap Heap) -> Self {
        P {
            ptr: Box::new_in([], heap),
        }
    }

    #[must_use]
    pub fn from_vec(vec: super::Vec<'heap, T>) -> Self {
        P {
            ptr: vec.into_boxed_slice(),
        }
    }

    #[must_use]
    pub fn into_vec(self) -> super::Vec<'heap, T> {
        self.ptr.into_vec()
    }
}

impl<T: ?Sized> Deref for P<'_, T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.ptr
    }
}

impl<T: ?Sized> DerefMut for P<'_, T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut self.ptr
    }
}

impl<'heap, T: Clone + 'heap> Clone for P<'heap, T> {
    #[expect(clippy::explicit_auto_deref, reason = "false-positive")]
    fn clone(&self) -> Self {
        P::new((**self).clone(), *Box::allocator(&self.ptr))
    }
}

impl<'heap, T: Clone + 'heap> Clone for P<'heap, [T]> {
    fn clone(&self) -> Self {
        P {
            ptr: self.ptr.clone(),
        }
    }
}

impl<T: ?Sized + Debug> Debug for P<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.ptr, fmt)
    }
}

impl<T: Display> Display for P<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&**self, fmt)
    }
}

impl<T> fmt::Pointer for P<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Pointer::fmt(&self.ptr, fmt)
    }
}
