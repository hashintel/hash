//! Internal implementation of the self referential structure

use alloc::{boxed::Box, vec, vec::Vec};

use crate::{frame::FrameImpl, Frame};

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
    ptr: *mut Box<Frame>,
    len: usize,
}

// RawSlice acts like a slice (in the same way as `&[T]`) and therefore is also Send and Sync if
// Frame is (which it is because `FrameImpl` is `Send` and `Sync`).
// SAFETY: `RawSlice` is `Send` and `Sync` if `Frame` is `Send` and `Sync`.
unsafe impl Send for RawSlice {}
// SAFETY: `RawSlice` is `Send` and `Sync` if `Frame` is `Send` and `Sync`.
unsafe impl Sync for RawSlice {}

impl RawSlice {
    /// Returns a reference to the slice of `Box<Frame>`.
    ///
    /// # Safety
    ///
    /// This function is safe because:
    /// - The sources are always in the same report as the `Frame`.
    /// - `Frame`s can only be constructed within a report.
    /// - The lifetime of the sources is tied to the lifetime of the `Frame`.
    pub(crate) fn as_slice(&self) -> &[Box<Frame>] {
        // SAFETY: The slice is valid for the lifetime of `self` because:
        // - The pointer and length are guaranteed to be valid for the lifetime of `RawSlice`.
        // - `Frame`s and their sources coexist within the same report structure.
        unsafe { core::slice::from_raw_parts(self.ptr, self.len) }
    }

    /// Returns a mutable reference to the slice of `Box<Frame>`.
    ///
    /// # Safety
    ///
    /// This function is safe because:
    /// - The sources are always in the same report as the `Frame`.
    /// - `Frame`s can only be constructed within a report.
    /// - The lifetime of the sources is tied to the lifetime of the `Frame`.
    /// - The report structure prohibits cycles, preventing aliasing issues.
    pub(crate) fn as_slice_mut(&mut self) -> &mut [Box<Frame>] {
        // SAFETY: The mutable slice is valid for the lifetime of `self` because:
        // - The pointer and length are guaranteed to be valid for the lifetime of `RawSlice`.
        // - `Frame`s and their sources coexist within the same report structure.
        // - The report prohibits cycles, ensuring no aliasing can occur.
        unsafe { core::slice::from_raw_parts_mut(self.ptr, self.len) }
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
        if self.enough_capacity(len) {
            let start = self.items.len();
            self.items.extend(frames);

            // we gain a mutable reference to the slice, because we'll be the only ones to ever
            // access it
            let ptr = self.items.as_mut_ptr();
            // add the length of the slice to the pointer
            // SAFETY: we know that the pointer is valid len is non-zero and we pushed at least a
            //  single item.
            let ptr = unsafe { ptr.add(start) };

            Ok(RawSlice { ptr, len })
        } else {
            Err(frames)
        }
    }

    fn capacity(&self) -> usize {
        self.items.capacity()
    }
}

pub(crate) struct ReportImpl {
    current: Vec<Box<Frame>>,
    fragments: Vec<Fragment>,
}

impl ReportImpl {
    pub(crate) fn new() -> Self {
        const INITIAL_FRAGMENT_CAPACITY: usize = 16;

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

    fn alloc_frame(frame: impl FrameImpl, sources: Option<RawSlice>) -> Box<Frame> {
        let typed = Box::new(TypedFrame {
            sources,
            r#impl: frame,
        });

        let dynamic = TypedFrame::into_dyn(typed);

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

    pub(crate) fn union(&mut self, other: Self) {
        // pretty simple and won't lead to any data being reallocated that is referenced to by a
        // `RawSlice`
        self.current.extend(other.current);
        self.fragments.extend(other.fragments);
    }
}
