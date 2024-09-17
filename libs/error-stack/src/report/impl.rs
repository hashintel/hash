//! Internal implementation of the self referential structure

use alloc::{boxed::Box, vec, vec::Vec};
use core::ptr::NonNull;

use crate::{frame::FrameImpl, Frame};

// DO NOT CHANGE THE LAYOUT OF THIS STRUCT WITHOUT CHANGING THE LAYOUT OF `Frame`.
// We use `#[repr(C)]` to ensure a predictable memory layout, as the `Rust` repr is not guaranteed.
#[repr(C)]
struct TypedFrame<F: ?Sized> {
    sources: Option<RawSlice>,
    r#impl: F,
}

impl<F> TypedFrame<F>
where
    F: FrameImpl,
{
    fn into_dyn(self: Box<Self>) -> Box<TypedFrame<dyn FrameImpl>> {
        self
    }
}

impl TypedFrame<dyn FrameImpl> {
    /// Erase the type information of the frame.
    fn erase(self: Box<Self>) -> Box<Frame> {
        let raw_ptr = Box::into_raw(self) as *mut Frame;

        // SAFETY: We can safely transmute between `TypedFrame<dyn FrameImpl>` and `Frame` because:
        // - Both structs have the same fields in the same order.
        // - Both use `#[repr(C)]`, ensuring the same memory layout.
        // - The unsized fields are of the same type (`dyn FrameImpl`).
        unsafe { Box::from_raw(raw_ptr) }
    }
}

/// Contiguous slice of [`Frame`]s.
///
/// This is lifetime erased to allow for a `Frame` to have no lifetime, because a `Frame` is a DST,
/// and is only constructed in the `ReportImpl` we know that the sources of the `Frame` are
/// **always** in the same `ReportImpl` and therefore have the same lifetime.
pub(crate) struct RawSlice {
    // We use `NonNull` here because it makes niche optimizations possible. `Option<RawSlice>` is
    // the same size as `RawSlice`.
    ptr: NonNull<Box<Frame>>,
    len: usize,
}

// SAFETY: `RawSlice` is safe to send between threads because:
// 1. It behaves like a slice (`&[T]`), which is `Send` if `T` is `Send`.
// 2. `Frame` is `Send` because `FrameImpl` is `Send`.
// 3. Each `Frame` has exclusive access to its memory, preventing aliasing across threads.
unsafe impl Send for RawSlice {}

// SAFETY: `RawSlice` is safe to share between threads because:
// 1. It behaves like a slice (`&[T]`), which is `Sync` if `T` is `Sync`.
// 2. `Frame` is `Sync` because `FrameImpl` is `Sync`.
// 3. Shared access to `RawSlice` doesn't allow for data races, as it only provides read-only access
//    to its contents.
unsafe impl Sync for RawSlice {}

impl RawSlice {
    /// Returns a reference to the slice of `Box<Frame>`.
    pub(crate) fn as_slice(&self) -> &[Box<Frame>] {
        // SAFETY: The slice is valid for the lifetime of `self` because:
        // - The pointer and length are guaranteed to be valid for the lifetime of `RawSlice`.
        // - `Frame`s and their sources coexist within the same report structure.
        unsafe { core::slice::from_raw_parts(self.ptr.as_ptr(), self.len) }
    }

    /// Returns a mutable reference to the slice of `Box<Frame>`.
    pub(crate) fn as_slice_mut(&mut self) -> &mut [Box<Frame>] {
        // SAFETY: The mutable slice is valid for the lifetime of `self` because:
        // - The pointer and length are guaranteed to be valid for the lifetime of `RawSlice`.
        // - `Frame`s and their sources coexist within the same report structure.
        // - The report prohibits cycles, ensuring no aliasing can occur.
        // - The `ReportImpl` guarantees that this slice is the only slice that has access to the
        //   memory it points to.
        unsafe { core::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len) }
    }
}

/// A Fragment is a contiguous sequence of frames that never re-allocates.
struct Fragment {
    // sadly we need the double indirection here because `dyn FrameImpl` is not `Sized` and
    // therefore cannot be stored directly in the `Vec`
    items: Vec<Box<Frame>>,
}

impl Fragment {
    fn new(size: usize) -> Self {
        Self {
            items: Vec::with_capacity(size),
        }
    }

    fn enough_capacity(&self, len: usize) -> bool {
        self.items.len() + len <= self.items.capacity()
    }

    fn append<T>(&mut self, frames: T) -> Result<RawSlice, T>
    where
        T: Iterator<Item = Box<Frame>> + ExactSizeIterator,
    {
        let len = frames.len();

        if !self.enough_capacity(len) {
            return Err(frames);
        }

        let start = self.items.len();
        self.items.extend(frames);

        // we gain a mutable reference to the slice, because we'll be the only ones to ever
        // access it
        let ptr = self.items.as_mut_ptr();
        // add the length of the slice to the pointer (we could also use
        // `&mut self.items[start..].as_mut_ptr()` but that isn't supported by miri)
        // SAFETY: we know that the pointer is valid len is non-zero and we pushed at least a
        //  single item.
        let ptr = unsafe { NonNull::new_unchecked(ptr.add(start)) };

        Ok(RawSlice { ptr, len })
    }

    fn capacity(&self) -> usize {
        self.items.capacity()
    }
}

// 8 is chosen here because it's a good balance between memory usage and allocations
// it allows for 4 consecutive `.change_context` without an allocation.
const INITIAL_FRAGMENT_CAPACITY: usize = 8;

pub(crate) struct ReportImpl {
    current: Vec<Box<Frame>>,
    fragments: Vec<Fragment>,
}

impl ReportImpl {
    pub(crate) fn new() -> Self {
        Self {
            current: Vec::new(),
            fragments: vec![Fragment::new(INITIAL_FRAGMENT_CAPACITY)],
        }
    }

    pub(crate) fn current(&self) -> &[Box<Frame>] {
        &self.current
    }

    pub(crate) fn current_mut(&mut self) -> &mut [Box<Frame>] {
        &mut self.current
    }

    /// Allocates a new frame with the given implementation and optional sources.
    ///
    /// This function constructs a dynamically sized type (DST) frame, which requires some
    /// careful handling due to Rust's current limitations with DSTs.
    ///
    /// # Implementation Details
    ///
    /// The function relies on three key invariants:
    ///
    /// 1. `repr(C)` layout compatibility: Types with identical fields and `repr(C)` have the same
    ///    memory layout. See [repr(C) documentation].
    ///
    /// 2. Unsizing coercion: Allows conversion from a concrete type to a trait object. See
    ///    [unsizing coercion documentation].
    ///
    /// 3. Safe transmutation: Transmuting between layout-compatible types is safe. See [transmute
    ///    documentation].
    ///
    /// # Process
    ///
    /// 1. Create a `TypedFrame` with concrete type information.
    /// 2. Coerce it to a trait object using `TypedFrame::into_dyn`.
    /// 3. Erase the type information by transmuting to `Frame`.
    ///
    /// This approach ensures type safety while allowing for flexible frame construction with
    /// minimal unsafe code.
    ///
    /// [repr(C) documentation]: https://rust-lang.github.io/unsafe-code-guidelines/layout/structs-and-tuples.html#c-compatible-layout-repr-c
    /// [unsizing coercion documentation]: https://doc.rust-lang.org/nomicon/exotic-sizes.html#dynamically-sized-types-dsts
    /// [transmute documentation]: https://doc.rust-lang.org/nomicon/transmutes.html
    fn alloc_frame(frame: impl FrameImpl, sources: Option<RawSlice>) -> Box<Frame> {
        // Create the initial allocated frame with concrete type (size 8 bytes)
        let typed = Box::new(TypedFrame {
            sources,
            r#impl: frame,
        });

        // Coerce the typed frame to a trait object (unsizing) (size 16 bytes)
        let dynamic = TypedFrame::into_dyn(typed);

        // Erase type information by transmuting to Frame (size 16 bytes)
        TypedFrame::erase(dynamic)
    }

    pub(crate) fn layer(&mut self, frame: impl FrameImpl) {
        if self.current.is_empty() {
            // no need to push the sources, simply allocate a new fragment as the current
            let frame = Self::alloc_frame(frame, None);
            self.current.push(frame);
            return;
        }

        // put the current onto the fragment, allocating a new fragment if needed
        let drain = self.current.drain(..);
        let fragment = self
            .fragments
            .last_mut()
            .unwrap_or_else(|| unreachable!("there is always at least a single fragment"));

        let frame = match fragment.append(drain) {
            Ok(slice) => {
                // we successfully appended the frames to the fragment
                Self::alloc_frame(frame, Some(slice))
            }
            Err(frames) => {
                // we need to allocate a new fragment
                // allocation strategy is always to double the size of the current fragment, with a
                // minimum of the needed size
                let size = (fragment.capacity() * 2).max(frames.len());
                let mut fragment = Fragment::new(size);
                let slice = fragment.append(frames).unwrap_or_else(|_| {
                    unreachable!("previous call ensures that enough space exists")
                });
                self.fragments.push(fragment);

                Self::alloc_frame(frame, Some(slice))
            }
        };

        self.current.push(frame);
    }

    pub(crate) fn last_fragment_capacity(&self) -> usize {
        self.fragments
            .last()
            .unwrap_or_else(|| unreachable!("there is always at least a single fragment"))
            .capacity()
    }

    pub(crate) fn union(&mut self, mut other: Self) {
        // pretty simple and won't lead to any data being reallocated that is referenced to by a
        // `RawSlice`
        if self.last_fragment_capacity() > other.last_fragment_capacity() {
            // we currently have more capacity than the other, so we "front load" the fragments of
            // other, so that we make use of that spare capacity
            other.fragments.append(&mut self.fragments);
            self.fragments = other.fragments;
        } else {
            // other has more capacity than we do, use it instead for the next operations
            self.fragments.append(&mut other.fragments);
        }

        self.current.extend(other.current);
    }
}

#[cfg(test)]
mod test {
    use super::{ReportImpl, INITIAL_FRAGMENT_CAPACITY};
    use crate::frame::AttachmentFrame;

    #[test]
    fn fragment_does_not_reallocate() {
        // simple test that simply forces a new fragment and ensures that the old fragment does not
        // reallocate.
        let mut r#impl = ReportImpl::new();

        let fragment_ptr = r#impl.fragments[0].items.as_ptr();
        assert_eq!(r#impl.fragments.len(), 1);

        // we need to add an additional fragment, because 1 fragment is always stored in `current`
        for _ in 0..=INITIAL_FRAGMENT_CAPACITY {
            r#impl.layer(AttachmentFrame::new("ABC"));
        }

        assert_eq!(r#impl.fragments[0].items.as_ptr(), fragment_ptr);
        assert_eq!(r#impl.fragments.len(), 1);

        r#impl.layer(AttachmentFrame::new("DEF"));
        assert_eq!(r#impl.fragments[0].items.as_ptr(), fragment_ptr);
        assert_eq!(r#impl.fragments.len(), 2);
    }
}
