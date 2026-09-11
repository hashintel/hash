//! Byte-stable types as their own rkyv archived forms.
//!
//! The offline dump archives its streams with rkyv, and most of the scalars inside those
//! records - row ids, source identities, digests - already have one representation on every
//! host: alignment 1 and no padding, with multi-byte fields little-endian by construction. Such a
//! type serves as its own archived form, so the mapped bytes are the value and neither side of
//! the format converts anything. [`self_archived!`] implements the rkyv trait set for one such
//! type, next to the type's own definition, where the layout derives that witness the contract
//! live.

/// Implements the rkyv trait set declaring a type its own archived form.
///
/// The type archives by copy. Its archived type is itself, serializing writes nothing beyond
/// the value's own bytes, and validation accepts every bit pattern. The expansion implements
/// [`Portable`](rkyv::Portable), [`NoUndef`](rkyv::traits::NoUndef), [`Archive`](rkyv::Archive),
/// [`Serialize`](rkyv::Serialize) for every serializer, and
/// [`CheckBytes`](rkyv::bytecheck::CheckBytes) for every validator.
///
/// The layout half of that contract is asserted at compile time. The expansion requires
/// [`Copy`] plus zerocopy's [`FromBytes`](zerocopy::FromBytes),
/// [`IntoBytes`](zerocopy::IntoBytes), [`Immutable`](zerocopy::Immutable) and
/// [`Unaligned`](zerocopy::Unaligned), which prove every bit pattern a valid value, every byte
/// of a value initialized, the layout fully packed, immutable under a shared reference, and
/// aligned to 1. A type
/// missing any bound fails the build at the invocation. A bounded id whose valid values are
/// narrower than its bit patterns has no [`FromBytes`](zerocopy::FromBytes), so it cannot pass
/// and implements the set by hand with a checking
/// [`CheckBytes`](rkyv::bytecheck::CheckBytes) instead.
///
/// # Safety
///
/// One property remains the invoking site's to prove, in a comment beside the invocation:
/// multi-byte fields are little-endian by construction, so the representation is identical on
/// every host. A byte-array type states that no multi-byte field exists.
macro_rules! self_archived {
    ($ty:ty) => {
        const _: () = {
            const fn structural<
                T: Copy
                    + ::zerocopy::FromBytes
                    + ::zerocopy::IntoBytes
                    + ::zerocopy::Immutable
                    + ::zerocopy::Unaligned,
            >() {
            }
            structural::<$ty>();
        };

        // SAFETY: `Unaligned` and `IntoBytes` (asserted above) prove alignment 1 and no
        // padding, and `Immutable` proves a mapped value is never written through a shared
        // reference. The invoking site states the one property no bound carries: multi-byte
        // fields are little-endian by construction, so the representation is identical on
        // every host.
        unsafe impl ::rkyv::Portable for $ty {}

        // SAFETY: `IntoBytes` (asserted above) proves every byte of a value is initialized,
        // with no padding at any offset.
        unsafe impl ::rkyv::traits::NoUndef for $ty {}

        impl ::rkyv::Archive for $ty {
            type Archived = Self;
            type Resolver = ();

            fn resolve(&self, (): Self::Resolver, out: ::rkyv::Place<Self>) {
                out.write(*self);
            }
        }

        impl<S: ::rkyv::rancor::Fallible + ?Sized> ::rkyv::Serialize<S> for $ty {
            fn serialize(&self, _serializer: &mut S) -> Result<Self::Resolver, S::Error> {
                Ok(())
            }
        }

        // SAFETY: `FromBytes` (asserted above) proves every bit pattern is a valid value, so
        // there is nothing to check.
        unsafe impl<C: ::rkyv::rancor::Fallible + ?Sized> ::rkyv::bytecheck::CheckBytes<C> for $ty {
            unsafe fn check_bytes(_value: *const Self, _context: &mut C) -> Result<(), C::Error> {
                Ok(())
            }
        }
    };
}

pub(crate) use self_archived;
