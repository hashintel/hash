pub mod bit_vec;
mod index;
mod slice;
mod union_find;
mod vec;

use core::{
    fmt::{self, Debug, Display},
    hash::Hash,
    marker::PhantomData,
    sync::atomic::AtomicU32,
};

use ::core::sync::atomic;

pub use self::{index::IntoSliceIndex, slice::IdSlice, union_find::IdUnionFind, vec::IdVec};

/// Represents errors that can occur when converting values to an [`Id`].
///
/// This error is returned by the `TryFrom` implementations for `Id` types when
/// a value is outside the valid range for the identifier.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IdError {
    /// The provided value is outside the valid range for the identifier.
    ///
    /// Contains the value that was provided, along with the minimum and maximum
    /// allowed values.
    OutOfRange { value: u64, min: u64, max: u64 },
}

impl Display for IdError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OutOfRange { value, min, max } => {
                write!(fmt, "Value {value} is out of range [{min}..={max}]!")
            }
        }
    }
}

/// Common interface for domain-specific identifiers.
///
/// Provides type safety for IDs of different domains (nodes, users, etc.)
/// while maintaining a consistent conversion API.
pub trait Id:
    Copy
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Hash
    + Debug
    + Display
    + TryFrom<u32, Error = IdError>
    + TryFrom<u64, Error = IdError>
    + TryFrom<usize, Error = IdError>
    + 'static
{
    /// The maximum value this ID type can represent.
    const MAX: Self;

    /// The minimum value this ID type can represent.
    const MIN: Self;

    /// Creates an ID from a [`u32`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_u32(index: u32) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Creates an ID from a [`u64`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_u64(index: u64) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Creates an ID from a [`usize`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_usize(index: usize) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Converts this ID to a [`u32`] value.
    fn as_u32(self) -> u32;

    /// Converts this ID to a [`u64`] value.
    fn as_u64(self) -> u64;

    /// Converts this ID to a [`usize`] value.
    fn as_usize(self) -> usize;

    /// Adds the given amount to this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    #[must_use = "Use `increment_by` to modify the id in place"]
    fn plus(self, amount: usize) -> Self {
        Self::from_usize(self.as_usize() + amount)
    }

    /// Subtracts the given amount from this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    #[must_use = "Use `decrement_by` to modify the id in place"]
    fn minus(self, amount: usize) -> Self {
        Self::from_usize(self.as_usize() - amount)
    }

    /// Mutably adds the given amount to this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    fn increment_by(&mut self, amount: usize) {
        *self = self.plus(amount);
    }

    /// Mutably subtracts the given amount from this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    fn decrement_by(&mut self, amount: usize) {
        *self = self.minus(amount);
    }

    /// Returns the previous ID in sequence, if it exists.
    ///
    /// Returns `None` if this ID is already at the minimum value.
    fn prev(self) -> Option<Self>;
}

/// Marker trait for types that have an associated ID.
///
/// This trait allows types to expose their identifier in a uniform way.
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::{HasId, Id}, newtype};
/// # newtype!(struct UserId(u32 is 0..=100));
/// struct User {
///     id: UserId,
///     name: String,
/// }
///
/// impl HasId for User {
///     type Id = UserId;
///
///     fn id(&self) -> Self::Id {
///         self.id
///     }
/// }
/// ```
pub trait HasId {
    type Id: Id;

    /// Returns the ID of this entity.
    fn id(&self) -> Self::Id;
}

impl<T> HasId for &T
where
    T: HasId,
{
    type Id = T::Id;

    fn id(&self) -> Self::Id {
        (**self).id()
    }
}

impl<I, T> HasId for (I, T)
where
    I: Id,
{
    type Id = I;

    fn id(&self) -> Self::Id {
        self.0
    }
}

/// Creates a new ID type with a specified valid range.
///
/// This uses the experimental pattern type syntax to define the minimum and maximum values.
///
/// # Syntax
/// ```
/// hashql_core::id::newtype!(pub struct NodeId(u32 is 0..=0xFFFF_FF00));
/// ```
///
/// This creates a newtype wrapper around [`u32`] with the Id trait fully implemented.
///
/// # Optional Attributes
///
/// - `#[steppable]` - Implements `core::iter::Step` for the ID type, enabling range iteration
///
/// ```
/// # #![feature(step_trait)]
/// hashql_core::id::newtype!(
///     #[steppable]
///     pub struct NodeId(u32 is 0..=100)
/// );
/// ```
#[macro_export]
macro_rules! newtype {
    (@internal in_bounds; $value:ident, $type:ty, $min:literal, $max:expr) => {
        $value >= ($min as $type) && $value <= ($max as $type)
    };

    (@internal error; $value:ident, $min:literal, $max:expr) => {
        concat!("ID value must be between ", stringify!($min), " and ", stringify!($max))
    };

    ($(#[$($attr:tt)*])* $vis:vis struct $name:ident($type:ident is $min:literal..=$max:expr)) => {
        $crate::id::newtype!(@parse_attrs [] [] [] ; $(#[$($attr)*])* ; $vis struct $name($type is $min..=$max));
    };

    (@parse_attrs [$($other:tt)*] [$($step:tt)*] [$($display:tt)*]; #[steppable] $(#[$($rest:tt)*])* ; $($tail:tt)*) => {
        $crate::id::newtype!(@parse_attrs [$($other)*] [$($step)* steppable] [$($display)*] ; $(#[$($rest)*])* ; $($tail)*);
    };

    (@parse_attrs [$($other:tt)*] [$($step:tt)*] [$($display:tt)*]; #[display = $display_expr:expr] $(#[$($rest:tt)*])* ; $($tail:tt)*) => {
        $crate::id::newtype!(@parse_attrs [$($other)*] [$($step)*] [$($display)* display = $display_expr] ; $(#[$($rest)*])* ; $($tail)*);
    };

    (@parse_attrs [$($other:tt)*] [$($step:tt)*] [$($display:tt)*]; #[no_display] $(#[$($rest:tt)*])* ; $($tail:tt)*) => {
        $crate::id::newtype!(@parse_attrs [$($other)*] [$($step)*] [$($display)* no_display] ; $(#[$($rest)*])* ; $($tail)*);
    };

    (@parse_attrs [$($other:tt)*] [$($step:tt)*] [$($display:tt)*]; #[$attr:meta] $(#[$($rest:tt)*])* ; $($tail:tt)*) => {
        $crate::id::newtype!(@parse_attrs [$($other)* #[$attr]] [$($step)*] [$($display)*] ; $(#[$($rest)*])* ; $($tail)*);
    };

    (@parse_attrs [$($other:tt)*] [$($step:tt)*] [$($display:tt)*]; ; $vis:vis struct $name:ident($type:ident is $min:literal..=$max:expr)) => {
        $crate::id::newtype!(@impl [$($other)*] [$($step)*] [$($display)*] $vis struct $name($type is $min..=$max));
    };

    // Implementation
    (@impl [$(#[$attr:meta])*] [$($step:tt)*] [$($display:tt)*] $vis:vis struct $name:ident($type:ident is $min:literal..=$max:expr)) => {
        $(#[$attr])*
        #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        $vis struct $name($type);

        #[expect(clippy::allow_attributes)]
        #[allow(dead_code, clippy::checked_conversions)]
        impl $name {
            /// Creates a new ID with the given value.
            ///
            /// # Panics
            ///
            /// When value is outside the valid range of $min..$max.
            #[must_use]
            $vis const fn new(value: $type) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, $type, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value)
            }
        }

        #[automatically_derived]
        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl $crate::id::Id for $name {
            const MIN: Self = Self($min);
            const MAX: Self = Self($max);

            // fast path that does not go through the default implementation
            fn from_u32(value: u32) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            fn from_u64(value: u64) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            fn from_usize(value: usize) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            #[inline]
            fn as_u32(self) -> u32 {
                self.0 as u32
            }

            #[inline]
            fn as_u64(self) -> u64 {
                self.0 as u64
            }

            #[inline]
            fn as_usize(self) -> usize {
                self.0 as usize
            }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                if self.0 == $min {
                    None
                } else {
                    Some(Self(self.0 - 1))
                }
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<u32> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u32) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: u64::from(value),
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<u64> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u64) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value,
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<usize> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: usize) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: value as u64,
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        impl $crate::id::HasId for $name {
            type Id = $name;

            fn id(&self) -> Self::Id {
                *self
            }
        }

        $crate::id::newtype!(@maybe_display $name ; $($display)*);
        $crate::id::newtype!(@maybe_step $name ; $($step)*);
    };

    // Generate Step implementation if steppable was specified
    (@maybe_step $name:ident ; steppable) => {
        impl ::core::iter::Step for $name {
            #[inline]
            fn steps_between(start: &Self, end: &Self) -> (usize, Option<usize>) {
                <usize as ::core::iter::Step>::steps_between(
                    &$crate::id::Id::as_usize(*start),
                    &$crate::id::Id::as_usize(*end),
                )
            }

            #[inline]
            fn forward_checked(start: Self, count: usize) -> Option<Self> {
                $crate::id::Id::as_usize(start)
                    .checked_add(count)
                    .map($crate::id::Id::from_usize)
            }

            #[inline]
            fn backward_checked(start: Self, count: usize) -> Option<Self> {
                $crate::id::Id::as_usize(start)
                    .checked_sub(count)
                    .map($crate::id::Id::from_usize)
            }
        }
    };

    // No Step implementation if steppable was not specified
    (@maybe_step $name:ident ; ) => {};

    (@maybe_display $name:ident ; no_display) => {};

    (@maybe_display $name:ident ; display = $display:expr) => {
        impl ::core::fmt::Display for $name {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                fmt.write_fmt(format_args!($display, self.0))
            }
        }
    };

    (@maybe_display $name:ident ; ) => {
        impl ::core::fmt::Display for $name {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                ::core::fmt::Display::fmt(&self.0, fmt)
            }
        }
    }
}

/// Thread-safe ID generator that produces unique IDs.
///
/// Uses an atomic counter to generate sequential IDs, making it safe to use
/// across multiple threads without external synchronization. IDs are generated
/// starting from 0 and incrementing by 1 for each call to [`next`].
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::IdProducer, newtype};
/// # newtype!(struct NodeId(u32 is 0..=1000));
/// let producer = IdProducer::<NodeId>::new();
/// let id1 = producer.next();
/// let id2 = producer.next();
/// assert_ne!(id1, id2);
/// ```
///
/// [`next`]: IdProducer::next
#[derive(Debug)]
pub struct IdProducer<I> {
    next: AtomicU32,
    _marker: PhantomData<fn() -> I>,
}

impl<I> IdProducer<I> {
    /// Creates a new `IdProducer` starting from ID 0.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            next: AtomicU32::new(0),
            _marker: PhantomData,
        }
    }

    /// Generates and returns the next unique ID.
    ///
    /// This method is thread-safe and can be called concurrently from multiple
    /// threads. Each call returns a unique ID in sequential order.
    ///
    /// # Panics
    ///
    /// Panics if the counter overflows the valid range for the ID type.
    #[inline]
    pub fn next(&self) -> I
    where
        I: Id,
    {
        // Relaxed ordering is sufficient, as this is the only place where interact with the atomic
        // counter and ordering is of no concern.
        let value = self.next.fetch_add(1, atomic::Ordering::Relaxed);

        I::from_u32(value)
    }
}

impl<I> Default for IdProducer<I> {
    fn default() -> Self {
        Self::new()
    }
}

/// Non-thread-safe ID counter that generates sequential IDs.
///
/// Unlike [`IdProducer`], this counter is not thread-safe but provides a simpler
/// interface for single-threaded scenarios. IDs are generated starting from
/// [`Id::MIN`] and incrementing by 1 for each call to [`next`].
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::IdCounter, newtype};
/// # newtype!(struct NodeId(u32 is 0..=1000));
/// let mut counter = IdCounter::<NodeId>::new();
/// let id1 = counter.next();
/// let id2 = counter.next();
/// assert_eq!(counter.size(), 2);
/// ```
///
/// [`next`]: IdCounter::next
#[derive(Debug)]
pub struct IdCounter<I> {
    next: I,
}

impl<I> IdCounter<I> {
    /// Creates a new `IdCounter` starting from [`Id::MIN`].
    #[must_use]
    pub const fn new() -> Self
    where
        I: Id,
    {
        Self { next: I::MIN }
    }

    /// Returns the number of IDs that have been generated so far.
    ///
    /// This is equal to the value of the next ID that will be generated.
    #[must_use]
    pub fn size(&self) -> usize
    where
        I: Id,
    {
        self.next.as_usize()
    }

    /// Returns the next ID that will be generated without incrementing the counter.
    ///
    /// This represents the upper bound (exclusive) of IDs that have been generated.
    #[must_use]
    pub const fn bound(&self) -> I
    where
        I: Id,
    {
        self.next
    }

    /// Generates and returns the next sequential ID.
    ///
    /// Increments the internal counter and returns the previous value.
    ///
    /// # Panics
    ///
    /// Panics if the counter overflows the valid range for the ID type.
    #[inline]
    #[expect(
        clippy::should_implement_trait,
        reason = "We return `I` instead of `Option<I>`, while similar we don't want to confuse \
                  users."
    )]
    pub fn next(&mut self) -> I
    where
        I: Id,
    {
        let value = self.next;
        self.next.increment_by(1);

        value
    }
}

impl<I> Default for IdCounter<I>
where
    I: Id,
{
    fn default() -> Self {
        Self::new()
    }
}

/// Creates a type alias for an [`IdProducer`] for the given ID type.
///
/// # Examples
///
/// ```
/// # use hashql_core::{newtype, newtype_producer};
/// # newtype!(struct NodeId(u32 is 0..=1000));
/// newtype_producer!(pub struct NodeIdProducer(NodeId));
/// ```
#[macro_export]
macro_rules! newtype_producer {
    ($vis:vis struct $name:ident($id:ty)) => {
        $vis type $name = $crate::id::IdProducer<$id>;
    };
}

/// Creates a type alias for an [`IdCounter`] for the given ID type.
///
/// # Examples
///
/// ```
/// # use hashql_core::{newtype, newtype_counter};
/// # newtype!(struct NodeId(u32 is 0..=1000));
/// newtype_counter!(pub struct NodeIdCounter(NodeId));
/// ```
#[macro_export]
macro_rules! newtype_counter {
    ($vis:vis struct $name:ident($id:ty)) => {
        $vis type $name = $crate::id::IdCounter<$id>;
    };
}

/// Creates type aliases for ID-indexed collections for the given ID type.
///
/// This macro generates a family of collection types that use the specified ID
/// type for indexing, including slices, vectors, union-find structures, sets,
/// and maps.
///
/// # Generated Types
///
/// For an ID type `Foo`, this generates:
/// - `{Name}Slice<T>` - ID-indexed slice
/// - `{Name}Vec<T, A>` - ID-indexed vector
/// - `{Name}UnionFind<A>` - Union-find data structure
/// - `{Name}Set<A>` - Hash set of IDs
/// - `{Name}SetEntry<'set, A>` - Entry in the hash set
/// - `{Name}Map<V, A>` - Hash map from IDs to values
/// - `{Name}MapEntry<'map, V, A>` - Entry in the hash map
///
/// # Examples
///
/// ```
/// # #![feature(allocator_api, macro_metavar_expr_concat)]
/// # extern crate alloc;
/// # use hashql_core::{newtype, newtype_collections};
/// # newtype!(struct NodeId(u32 is 0..=1000));
/// newtype_collections!(pub type Node* from NodeId);
/// // Creates: NodeSlice, NodeVec, NodeUnionFind, NodeSet, NodeMap, etc.
/// ```
#[macro_export]
macro_rules! newtype_collections {
    ($vis:vis type $name:ident* from $id:ty) => {
        $vis type ${concat($name, Slice)}<T> = $crate::id::IdSlice<$id, T>;
        $vis type ${concat($name, Vec)}<T, A = ::alloc::alloc::Global> = $crate::id::IdVec<$id, T, A>;
        $vis type ${concat($name, UnionFind)}<A = ::alloc::alloc::Global> = $crate::id::IdUnionFind<$id, A>;

        $vis type ${concat($name, Set)}<A = ::alloc::alloc::Global> = $crate::collections::FastHashSet<$id, A>;
        $vis type ${concat($name, SetEntry)}<'set, A = ::alloc::alloc::Global> = $crate::collections::FastHashSetEntry<'set, $id, A>;

        $vis type ${concat($name, Map)}<V, A = ::alloc::alloc::Global> = $crate::collections::FastHashMap<$id, V, A>;
        $vis type ${concat($name, MapEntry)}<'map, V, A = ::alloc::alloc::Global> = $crate::collections::FastHashMapEntry<'map, $id, V, A>;
    };
}

pub use newtype;
pub use newtype_collections;
pub use newtype_counter;
pub use newtype_producer;
