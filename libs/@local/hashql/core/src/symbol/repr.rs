#![expect(unsafe_code)]
//! Compact symbol representation using tagged pointers.
//!
//! This module provides [`Repr`], a single-word representation for symbols that can be either:
//!
//! - **Runtime symbols**: Heap-allocated on a bump allocator with inline string data
//! - **Constant symbols**: Indices into a static string table, encoded directly in pointer bits
//!
//! # Design Goals
//!
//! - **Compact**: `Repr` is exactly one pointer in size (8 bytes on 64-bit)
//! - **Niche optimization**: `Option<Repr>` is also one pointer in size
//! - **Efficient**: Symbols are frequently created but rarely accessed
//!
//! # Tagged Pointer Scheme
//!
//! Uses the lowest bit as a discriminant tag (possible because allocations are 2-byte aligned):
//!
//! - Bit 0 = `0`: Runtime symbol (pointer to [`RuntimeSymbol`] allocation)
//! - Bit 0 = `1`: Constant symbol (index shifted left by 1, `OR`ed with tag)
//!
//! # Provenance
//!
//! Runtime symbols store a [`NonNull<RuntimeSymbol>`] rather than a reference to preserve
//! full allocation provenance. Creating `&RuntimeSymbol` would narrow provenance to just the
//! header, causing undefined behavior when accessing the trailing inline bytes under strict
//! provenance / Stacked Borrows.

use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Layout},
    mem,
    num::NonZero,
    ptr::{self, NonNull},
};

use crate::heap::BumpAllocator;

/// Static table of constant symbol strings.
///
/// Constant symbols encode an index into this table rather than storing string data.
static STRINGS: &[&str] = &["foo", "bar"];

/// Header for a runtime-allocated symbol with inline string data.
///
/// # Memory Layout
///
/// ```text
/// ┌──────────────┬──────────────────────┐
/// │ len: usize   │ data: [u8; len]      │
/// └──────────────┴──────────────────────┘
/// ```
///
/// The `data` field is a zero-sized array marker; actual bytes are allocated
/// immediately after the header. The struct uses `#[repr(C)]` to guarantee
/// this layout.
///
/// # Provenance
///
/// References to this type (`&RuntimeSymbol`) only have provenance for the header,
/// not the trailing bytes. All access must go through [`NonNull<RuntimeSymbol>`]
/// to preserve full allocation provenance.
#[repr(C, align(2))]
struct RuntimeSymbol {
    len: usize,
    data: [u8; 0],
}

impl RuntimeSymbol {
    /// Computes the allocation layout for a runtime symbol with `len` bytes of data.
    fn layout(len: usize) -> Layout {
        Layout::from_size_align(
            size_of::<Self>().checked_add(len).expect("overflow"),
            mem::align_of::<Self>(),
        )
        .expect("invalid RuntimeSymbol layout")
    }

    /// Allocates a runtime symbol containing `value` on the given allocator.
    ///
    /// Returns a [`NonNull`] pointer with provenance for the entire allocation,
    /// including the trailing string bytes.
    ///
    /// # Panics
    ///
    /// Panics if allocation fails.
    fn alloc<A: BumpAllocator>(alloc: &A, value: &str) -> NonNull<Self> {
        let Ok(value) = Self::try_alloc(alloc, value) else {
            handle_alloc_error(Self::layout(value.len()))
        };

        value
    }

    /// Attempts to allocate a runtime symbol containing `value`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the allocator cannot satisfy the request.
    fn try_alloc<A: BumpAllocator>(alloc: &A, value: &str) -> Result<NonNull<Self>, AllocError> {
        let len = value.len();

        let layout = Self::layout(value.len());

        let ptr = alloc.allocate(layout)?.cast::<Self>();

        // SAFETY: `ptr` points to a freshly allocated block of `layout` size.
        // We write `len` to the header and copy `len` bytes of string data
        // immediately after the header, which fits within the allocation.
        unsafe {
            ptr.cast::<usize>().write(len);

            let buf = ptr.add(1).cast::<u8>();
            ptr::copy_nonoverlapping(value.as_ptr(), buf.as_ptr(), len);
        }

        Ok(ptr)
    }

    /// Returns a pointer to the inline string data.
    ///
    /// This performs pointer arithmetic without dereferencing, so it is safe.
    /// The returned pointer has provenance for the trailing bytes if `this`
    /// has provenance for the full allocation.
    const fn data_ptr(this: NonNull<Self>) -> NonNull<u8> {
        // SAFETY: `this` points to a valid `RuntimeSymbol` allocation, which
        // always has at least `size_of::<Self>()` bytes. Adding 1 moves past
        // the header to the inline data region.
        unsafe { this.add(1) }.cast()
    }

    /// Reads the length of the inline string data.
    ///
    /// # Safety
    ///
    /// - `this` must point to a valid, initialized [`RuntimeSymbol`] allocation.
    /// - The allocation must remain live for the duration of this call.
    const unsafe fn len(this: NonNull<Self>) -> usize {
        // SAFETY: Caller guarantees `this` points to a valid, initialized allocation.
        unsafe { this.cast::<usize>().read() }
    }

    /// Returns the inline data as a byte slice.
    ///
    /// # Safety
    ///
    /// - `this` must point to a valid, initialized [`RuntimeSymbol`] allocation.
    /// - The allocation must remain live for the lifetime `'a`.
    /// - The returned slice must not be mutated for the lifetime `'a`.
    const unsafe fn as_bytes<'a>(this: NonNull<Self>) -> &'a [u8] {
        // SAFETY: Caller guarantees `this` is valid and the allocation outlives `'a`.
        // `data_ptr` returns a pointer to the inline bytes, and `len` returns the count.
        unsafe { core::slice::from_raw_parts(Self::data_ptr(this).as_ptr(), Self::len(this)) }
    }

    /// Returns the inline data as a string slice.
    ///
    /// # Safety
    ///
    /// - `this` must point to a valid, initialized [`RuntimeSymbol`] allocation.
    /// - The allocation must remain live for the lifetime `'a`.
    /// - The returned string must not be mutated for the lifetime `'a`.
    const unsafe fn as_str<'a>(this: NonNull<Self>) -> &'a str {
        // SAFETY: Caller guarantees `this` is valid and the allocation outlives `'a`.
        // The bytes are valid UTF-8 because they were copied from a `&str` in `try_alloc`.
        unsafe { core::str::from_raw_parts(Self::data_ptr(this).as_ptr(), Self::len(this)) }
    }
}

/// A constant symbol represented as an index into [`STRINGS`].
#[derive(Copy, Clone)]
struct ConstantSymbol(usize);

impl ConstantSymbol {
    /// Returns the string value for this constant symbol.
    fn as_str(self) -> &'static str {
        STRINGS[self.0]
    }

    /// Returns the string value without bounds checking.
    ///
    /// # Safety
    ///
    /// The index must be within bounds of [`STRINGS`].
    unsafe fn as_str_unchecked(self) -> &'static str {
        // SAFETY: Caller guarantees the index is in bounds.
        unsafe { STRINGS.get_unchecked(self.0) }
    }
}

/// A compact, single-word representation for symbols.
///
/// Uses a tagged pointer to distinguish between runtime and constant symbols:
///
/// - **Runtime** (tag = 0): Pointer to a [`RuntimeSymbol`] allocation
/// - **Constant** (tag = 1): Index into [`STRINGS`] encoded in the pointer bits
///
/// # Size
///
/// `Repr` is exactly one pointer in size. Thanks to [`NonNull`], `Option<Repr>`
/// is also one pointer in size (niche optimization).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct Repr {
    ptr: NonNull<u8>,
}

impl Repr {
    /// Minimum alignment for runtime symbol allocations.
    ///
    /// Must be at least 2 to ensure the lowest bit is always 0 for valid pointers.
    const MIN_ALIGN: usize = 2;
    /// Tag value for constant symbols (bit 0 = 1).
    const TAG_CONSTANT: usize = 0b1;
    /// Bitmask for extracting the tag from a pointer address.
    const TAG_MASK: usize = 0b1;
    /// Tag value for runtime symbols (bit 0 = 0).
    const TAG_RUNTIME: usize = 0b0;
    /// Number of bits used for the tag (determines how much to shift indices).
    const TAG_SHIFT: u32 = 1;

    /// Returns the tag value (0 for runtime, 1 for constant).
    fn tag(self) -> usize {
        self.ptr.addr().get() & Self::TAG_MASK
    }

    /// Extracts the runtime symbol pointer.
    ///
    /// # Safety
    ///
    /// - `self` must have been created via [`Repr::runtime`].
    /// - The underlying allocation must still be live.
    unsafe fn as_runtime_symbol(self) -> NonNull<RuntimeSymbol> {
        debug_assert!(self.tag() == Self::TAG_RUNTIME);

        self.ptr
            .map_addr(|addr| {
                // SAFETY: Runtime symbols are aligned to at least MIN_ALIGN (2), so the
                // lowest bit is always 0. Masking it off preserves a valid, non-zero address.
                unsafe { NonZero::new_unchecked(addr.get() & !Self::TAG_MASK) }
            })
            .cast::<RuntimeSymbol>()
    }

    /// Extracts the constant symbol index.
    ///
    /// # Safety
    ///
    /// - `self` must have been created via [`Repr::constant`].
    unsafe fn as_constant_symbol(self) -> ConstantSymbol {
        debug_assert!(self.tag() == Self::TAG_CONSTANT);

        let addr = self.ptr.addr().get();
        ConstantSymbol((addr & !Self::TAG_MASK) >> Self::TAG_SHIFT)
    }

    /// Returns the string content of this symbol.
    ///
    /// # Safety
    ///
    /// - For runtime symbols: the allocation must remain live for lifetime `'str`.
    /// - The returned string must not be mutated for lifetime `'str`.
    unsafe fn as_str<'str>(self) -> &'str str {
        if self.tag() == Self::TAG_RUNTIME {
            // SAFETY: Caller guarantees the allocation is live for 'str.
            unsafe { RuntimeSymbol::as_str(self.as_runtime_symbol()) }
        } else {
            // SAFETY: Constant symbols return &'static str, which coerces to &'str.
            unsafe { self.as_constant_symbol().as_str_unchecked() }
        }
    }

    /// Creates a `Repr` for a constant symbol.
    ///
    /// The index is encoded directly in the pointer bits (shifted to make room for the tag).
    const fn constant(constant: ConstantSymbol) -> Self {
        const {
            assert!(
                Self::TAG_CONSTANT != 0,
                "Constant symbol tag must be non-zero"
            );
        }

        debug_assert!(
            (constant.0 << Self::TAG_SHIFT >> Self::TAG_SHIFT) == constant.0,
            "constant has set the top most bit"
        );
        debug_assert!(constant.0 < STRINGS.len(), "constant is out of range");

        let addr = (constant.0 << Self::TAG_SHIFT) | Self::TAG_CONSTANT;
        let ptr = ptr::without_provenance_mut(addr);

        Self {
            // SAFETY: TAG_CONSTANT is non-zero, therefore `addr` is non-null.
            ptr: unsafe { NonNull::new_unchecked(ptr) },
        }
    }

    /// Creates a `Repr` for a runtime symbol.
    ///
    /// The pointer is stored directly with its tag bit set to 0 (which is a no-op
    /// since runtime allocations are already aligned).
    fn runtime(symbol: NonNull<RuntimeSymbol>) -> Self {
        const {
            assert!(align_of::<RuntimeSymbol>() >= Self::MIN_ALIGN);
        }

        let ptr = symbol.map_addr(|addr| addr | Self::TAG_RUNTIME).cast();

        Self { ptr }
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]
    use core::mem;

    use super::{ConstantSymbol, Repr, RuntimeSymbol, STRINGS};
    use crate::heap::Scratch;

    #[test]
    fn repr_size_is_one_pointer() {
        assert_eq!(mem::size_of::<Repr>(), mem::size_of::<*const ()>());
    }

    #[test]
    fn option_repr_size_is_one_pointer() {
        assert_eq!(mem::size_of::<Option<Repr>>(), mem::size_of::<*const ()>());
    }

    #[test]
    fn runtime_symbol_has_minimum_alignment() {
        assert!(mem::align_of::<RuntimeSymbol>() >= Repr::MIN_ALIGN);
    }

    #[test]
    fn constant_symbol_first_entry() {
        let constant = ConstantSymbol(0);
        let repr = Repr::constant(constant);

        // SAFETY: `repr` is a constant symbol with a valid index, no allocation lifetime concerns.
        assert_eq!(unsafe { repr.as_str() }, STRINGS[0]);
        // SAFETY: `repr` is a constant symbol with a valid index, no allocation lifetime concerns.
        assert_eq!(unsafe { repr.as_str() }, "foo");
    }

    #[test]
    fn constant_symbol_second_entry() {
        let constant = ConstantSymbol(1);
        let repr = Repr::constant(constant);

        // SAFETY: `repr` is a constant symbol with a valid index, no allocation lifetime concerns.
        assert_eq!(unsafe { repr.as_str() }, STRINGS[1]);
        // SAFETY: `repr` is a constant symbol with a valid index, no allocation lifetime concerns.
        assert_eq!(unsafe { repr.as_str() }, "bar");
    }

    #[test]
    fn runtime_symbol_empty_string() {
        let heap = Scratch::new();
        let symbol = RuntimeSymbol::alloc(&heap, "");
        let repr = Repr::runtime(symbol);

        // SAFETY: `heap` is live for the duration of this assertion.
        assert_eq!(unsafe { repr.as_str() }, "");
    }

    #[test]
    fn runtime_symbol_simple_string() {
        let heap = Scratch::new();
        let symbol = RuntimeSymbol::alloc(&heap, "hello");
        let repr = Repr::runtime(symbol);

        // SAFETY: `heap` is live for the duration of this assertion.
        assert_eq!(unsafe { repr.as_str() }, "hello");
    }

    #[test]
    fn runtime_symbol_unicode() {
        let heap = Scratch::new();
        let symbol = RuntimeSymbol::alloc(&heap, "日本語 🎉 émojis");
        let repr = Repr::runtime(symbol);

        // SAFETY: `heap` is live for the duration of this assertion.
        assert_eq!(unsafe { repr.as_str() }, "日本語 🎉 émojis");
    }

    #[test]
    fn runtime_symbol_long_string() {
        let heap = Scratch::new();
        let long_string = "a".repeat(10_000);
        let symbol = RuntimeSymbol::alloc(&heap, &long_string);
        let repr = Repr::runtime(symbol);

        // SAFETY: `heap` is live for the duration of this assertion.
        assert_eq!(unsafe { repr.as_str() }, long_string);
    }

    #[test]
    fn multiple_runtime_symbols() {
        let heap = Scratch::new();

        let symbol1 = RuntimeSymbol::alloc(&heap, "first");
        let symbol2 = RuntimeSymbol::alloc(&heap, "second");
        let symbol3 = RuntimeSymbol::alloc(&heap, "third");

        let repr1 = Repr::runtime(symbol1);
        let repr2 = Repr::runtime(symbol2);
        let repr3 = Repr::runtime(symbol3);

        // SAFETY: `heap` is live for the duration of these assertions.
        assert_eq!(unsafe { repr1.as_str() }, "first");
        // SAFETY: `heap` is live for the duration of these assertions.
        assert_eq!(unsafe { repr2.as_str() }, "second");
        // SAFETY: `heap` is live for the duration of these assertions.
        assert_eq!(unsafe { repr3.as_str() }, "third");
    }

    #[test]
    fn tag_distinguishes_constant_from_runtime() {
        let heap = Scratch::new();

        let constant = Repr::constant(ConstantSymbol(0));
        let runtime = Repr::runtime(RuntimeSymbol::alloc(&heap, "test"));

        assert_eq!(constant.tag(), Repr::TAG_CONSTANT);
        assert_eq!(runtime.tag(), Repr::TAG_RUNTIME);
    }

    #[test]
    fn runtime_symbol_stores_correct_length() {
        let heap = Scratch::new();
        let symbol = RuntimeSymbol::alloc(&heap, "hello");

        // SAFETY: `symbol` points to a valid allocation and `heap` is live.
        unsafe {
            assert_eq!(RuntimeSymbol::len(symbol), 5);
            assert_eq!(RuntimeSymbol::as_str(symbol).len(), 5);
        }
    }
}
