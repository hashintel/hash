use alloc::borrow::Cow;
use core::{error::Error, fmt};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{plain::PropertyBag, Run};

/// An error returned when calculating the relative or absolute address.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AddressCalculationError {
    /// The [`Address::parent_index`] property is absent.
    ParentIndexAbsent,
    /// The [`Address::parent_index`] property is out of bounds.
    ParentIndexOutOfBounds,
    /// The [`Address::offset_from_parent`] property is absent even though the
    /// [`Address::parent_index`] property is present.
    ///
    /// This is a violation of the SARIF specification.
    OffsetFromParentAbsent,
    /// The sum of the parent's [`Address::absolute_address`] and the
    /// [`Address::offset_from_parent`] overflows the addressable region.
    Overflow,
    /// The sum of the parent's [`Address::absolute_address`] and the
    /// [`Address::offset_from_parent`] is negative.
    Underflow,
}

impl fmt::Display for AddressCalculationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ParentIndexAbsent => fmt.write_str("`parent_index` is absent"),
            Self::ParentIndexOutOfBounds => fmt.write_str("`parent_index` is out of bounds"),
            Self::OffsetFromParentAbsent => fmt.write_str("`offset_from_parent` is absent"),
            Self::Overflow => fmt.write_str("address calculation overflowed"),
            Self::Underflow => fmt.write_str("address calculation is negative"),
        }
    }
}

impl Error for AddressCalculationError {}

/// An error returned when validating an [`Address`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AddressValidationError {
    /// If [`Address::parent_index`] property is absent, then the [`Address::absolute_address`]
    /// property must also be absent.
    RelativeAddressPresent,
    /// If [`Address::parent_index`] property is absent, then the [`Address::offset_from_parent`]
    /// property must also be absent.
    OffsetFromParentPresent,
    /// The [`Address::absolute_address`] property does not correspond to the result of
    /// [`Address::calculate_absolute_address`].
    AbsoluteAddressMismatch,
    /// The [`Address::relative_address`] property does not correspond to the result of
    /// [`Address::calculate_relative_address`].
    RelativeAddressMismatch,
    /// The [`Address::index`] property is out of bounds.
    IndexOutOfBounds,
    /// The address could not be calculated.
    AddressCalculationError(AddressCalculationError),
}

impl fmt::Display for AddressValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RelativeAddressPresent => {
                fmt.write_str("`relative_address` is present when `parent_index` is absent")
            }
            Self::OffsetFromParentPresent => {
                fmt.write_str("`offset_from_parent` is present when `parent_index` is absent")
            }
            Self::AbsoluteAddressMismatch => fmt.write_str("`absolute_address` is incorrect"),
            Self::RelativeAddressMismatch => fmt.write_str("`relative_address` is incorrect"),
            Self::IndexOutOfBounds => fmt.write_str("`index` is out of bounds"),
            Self::AddressCalculationError(e) => e.fmt(fmt),
        }
    }
}

impl Error for AddressValidationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::AddressCalculationError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<AddressCalculationError> for AddressValidationError {
    fn from(error: AddressCalculationError) -> Self {
        Self::AddressCalculationError(error)
    }
}

/// A physical or virtual address, or a range of addresses, in an 'addressable region' (memory or a
/// binary file).
///
/// See [SARIF specification §3.32](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317705)
///
/// # Parent-Child Relationships
///
/// `Address` objects can be linked by their [`parent_index`] properties ([§3.32.13]) to form a
/// chain in which each address is specified as an offset from a “parent” object which we refer to
/// as `theParent`.
///
/// See [SARIF specification §3.32.2](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317707)
///
/// [`parent_index`]: Self::parent_index
/// [§3.32.13]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718
///
/// ## Example
///
/// In this example, the location of the Sections region of a Windows ® Portable Executable file
/// [[PE]] is expressed as an offset from the start of the module. The location of the `.text`
/// section is in turn expressed as an offset from `Sections`.
///
/// <pre>
/// {                                  # A <a href="struct.Run.html"><code>Run</code></a> object (<a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317484">§3.14</a>).
///   "<a href="struct.Run.html#structfield.addresses">addresses</a>": [                   # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317502">§3.14.18</a>.
///     {
///       "<a href="#structfield.name">name</a>": "Multitool.exe",     # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317715">§3.32.10</a>.
///       "<a href="#structfield.kind">kind</a>": "module",            # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317717">§3.32.12</a>.
///       "<a href="#structfield.absolute_address">absoluteAddress</a>": 1024      # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317711">§3.32.6</a>.
///     },
///     {
///       "<a href="#structfield.name">name</a>": "Sections",
///       "<a href="#structfield.kind">kind</a>": "header",
///       "<a href="#structfield.parent_index">parentIndex</a>": 0,            # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718">§3.32.13</a>.
///       "<a href="#structfield.offset_from_parent">offsetFromParent</a>": 376,     # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317713">§3.32.8</a>.
///       "<a href="#structfield.absolute_address">absoluteAddress</a>": 1400,
///       "<a href="#structfield.relative_address">relativeAddress</a>": 376       # See <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317712">§3.32.7</a>.
///     },
///     {
///       "<a href="#structfield.name">name</a>": ".text",
///       "<a href="#structfield.kind">kind</a>": "section",
///       "<a href="#structfield.parent_index">parentIndex</a>": 1,
///       "<a href="#structfield.offset_from_parent">offsetFromParent</a>": 136,
///       "<a href="#structfield.absolute_address">absoluteAddress</a>": 1536,
///       "<a href="#structfield.relative_address">relativeAddress</a>": 512
///     }
///   ],
///   ...
/// }
/// </pre>
///
/// [PE]: https://docs.microsoft.com/en-us/windows/desktop/debug/pe-format
/// [$3.14]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317484
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Address<'s> {
    /// The index within [`Run::address`]es of the cached object for this address.
    ///
    /// Depending on the circumstances, an `Address` object either **may**, **shall not**, or
    /// **shall** contain a property named `index` whose value is the array index ([§3.7.4]) within
    /// [`Run::address`]es ([§3.14.18]) of an `Address` object that provides the properties for
    /// `self`. We refer to the object in [`Run::address`]es as the “cached object”.
    ///
    /// If `self` is an element of [`Run::address`]es, then `index` **may** be present. If
    /// present, its value **shall** be the index of `self` within [`Run::address`]es.
    ///
    /// Otherwise, if [`Run::address`]es is absent, or if it does not contain a cached object
    /// for `self`, then `index` **shall not** be present.
    ///
    /// Otherwise (that is, if `self` belongs to a [`Result`], and [`Run::address`]es contains
    /// a cached object for `self`), then `index` **shall* be present, and its value **shall*
    /// be the array index within [`Run::address`]es of the cached object.
    ///
    /// If `index` is present, `self`
    /// **shall** take all properties present on the cached object. If `self` contains any
    /// properties other than `index`, they **shall** equal the corresponding properties of the
    /// cached object.
    ///
    /// [`Run::address`]: crate::schema::Run::addresses
    /// [`Result`]: crate::schema::Result
    /// [§3.7.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317447
    /// [§3.14.18]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317502
    ///
    /// ## Note
    ///
    /// This allows a SARIF producer to reduce the size of the log file by reusing the same
    /// `Address` object in multiple results.
    ///
    /// ## Note
    ///
    /// For examples of the use of an index property to locate a cached object, see [§3.38.2].
    ///
    /// [§3.38.2]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317753
    ///
    /// See [SARIF specification §3.32.5](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317710)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub index: Option<usize>,

    /// The address expressed as a byte offset from the start of the addressable region.
    ///
    /// The value is a non-negative integer containing the absolute address (see [§3.32.3]) of this
    /// object.
    ///
    /// [§3.32.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317708
    ///
    /// See [SARIF specification §3.32.6](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317711)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub absolute_address: Option<usize>,

    /// The address expressed as a byte offset from the absolute address of the top-most parent
    /// object.
    ///
    /// If [`parent_index`] ([§3.32.13]) is present, an address object **may** contain a property
    /// named `relative_address` whose value, if present, is an integer containing the relative
    /// address (see [§3.32.4]) of this object.
    ///
    /// If [`parent_index`] is absent, `relative_address` **shall** be absent.
    ///
    /// [`parent_index`]: Self::parent_index
    /// [§3.32.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317709
    /// [§3.32.13]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718
    ///
    /// See [SARIF specification §3.32.7](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317712)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub relative_address: Option<isize>,

    /// The byte offset of this address from the absolute or relative address of the parent object.
    ///
    /// If [`parent_index`] ([§3.32.13]) is present, an `Address` object **may** contain a property
    /// named `offset_from_parent` whose value, if present, is an integer containing the offset of
    /// this `Address` from the absolute address of the parent (see [§3.32.2]). This is the
    /// case even if the absolute address of the parent cannot be determined by
    /// [`calculate_absolute_address`] in [§3.32.3].
    ///
    /// If [`parent_index`] is absent, `offset_from_parent` **shall** be absent.
    ///
    /// [`parent_index`]: Self::parent_index
    /// [`calculate_absolute_address`]: Self::calculate_absolute_address
    /// [§3.32.2]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317707
    /// [§3.32.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317708
    /// [§3.32.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718
    ///
    /// ## Note
    ///
    /// The rationale is that the absolute address always exists, even if the log file does not
    /// contain enough information to determine it, so it is always sensible to talk about an
    /// offset from that address.
    ///
    /// See [SARIF specification §3.32.8](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317713)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub offset_from_parent: Option<isize>,

    /// The number of bytes in this range of addresses.
    ///
    /// The value, if present, is an integer whose absolute value specifies the number of bytes in
    /// the range of addresses specified by this object.
    ///
    /// A negative value for `length` **shall** mean that the data structure being described grows
    /// from higher addresses towards lower addresses (as, for example, is often the case for a
    /// stack).
    ///
    /// See [SARIF specification §3.32.9](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317714)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub length: Option<isize>,

    /// A name that is associated with the address, e.g., ".text".
    ///
    /// See [SARIF specification §3.32.10](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317715)
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub name: Option<Cow<'s, str>>,

    /// A human-readable fully qualified name that is associated with the address.
    ///
    /// The value is a string containing the fully qualified name of this address.
    ///
    /// ## Example
    ///
    /// ```json
    /// {
    ///     "fullyQualifiedName": "MyDll.dll+0x47"
    /// }
    /// ```
    ///
    /// This name consists of two components. The first component is the name of the address at
    /// which the module was loaded into memory. The second component represents an offset from
    /// that address.
    ///
    /// See [SARIF specification §3.32.11](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317716)
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub fully_qualified_name: Option<Cow<'s, str>>,

    /// An open-ended string that specifies the kind of addressable region in which this address is
    /// located.
    ///
    /// When possible, SARIF producers **should** use the following values with the specified
    /// meanings:
    ///
    /// - `"data"`: An addressable location containing non-executable data.
    /// - `"header"`:  A data structure that precedes one or more addressable regions and specifies
    ///   the layout and location of objects within the address space.
    /// - `"function"`: An addressable region, possibly named, containing a sequence of
    ///   instructions that perform a specified task.
    /// - `"instruction"`: An addressable location containing executable code.
    /// - `"page"`: An addressable region whose contents can be moved between primary and secondary
    ///   storage.
    /// - `"section"`: A named region of a file containing executable code or data, which in some
    ///   circumstances is loaded into memory.
    /// - `"segment"`: A data structure in a binary that describes a region of memory, specifying
    ///   its addressing and permissions information, as well as information about which sections
    ///   are to be loaded into the segment. 2. A region of memory whose contents are specified by
    ///   the information in a segment defined in a binary, or by the operating system.
    /// - `"stack"`: An addressable region containing a call stack.
    /// - `"stackFrame"`: An addressable region containing a single frame from within a call stack.
    /// - `"module"`: The location at which a module was loaded.
    /// - `"table"`: An addressable region with a distinct purpose and a specified internal
    ///   organization
    ///
    /// The definitions of some of these "kind" values vary across operating systems.A SARIF
    /// producer **should** use the term most appropriate for the target operating system.
    ///
    /// Although a function does contain executable code, the value `"function"` **should** be used
    /// for the address of the start of a function, because it is more specific. The value
    /// `"instruction"` **should** be used for an address within the body of a function.
    ///
    /// If none of these values are appropriate, a SARIF producer **may** use any value.
    ///
    /// See [SARIF specification §3.32.12](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317717)
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub kind: Option<Cow<'s, str>>,

    /// The index within [`Run::address`]es of the parent object.
    ///
    /// If the parent exists (that is, if `self` is expressed as an offset from some other
    /// address), then an address object **shall** contain a property named `parent_index` whose
    /// value is the array index ([§3.7.4]) of parent within [`Run::address`]es ([§3.14.18]).
    ///
    /// If the parent does not exist, then `parent_index` **shall** be absent.
    ///
    /// [`Run::address`]: crate::schema::Run::addresses
    /// [§3.7.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317447
    /// [§3.14.18]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317502
    ///
    /// See [SARIF specification §3.32.13](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718)
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub parent_index: Option<usize>,

    /// Key/value pairs that provide additional information about the object.
    ///
    /// See [SARIF specification §3.8](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317448)
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl Address<'_> {
    /// Returns or calculates the absolute address of this `Address`.
    ///
    /// Each address object has an associated value called its “absolute address” which is the
    /// offset of the address from the start of the addressable region. The absolute address is
    /// calculated by executing the function as shown below or by any procedure with the same
    /// result.
    ///
    /// This procedure assumes that the [`offset_from_parent`] ([§3.32.8]) and [`parent_index`]
    /// ([§3.32.13]) properties are either both present or both absent; if this is not the case,
    /// the SARIF file is invalid.
    ///
    /// [`offset_from_parent`]: Self::offset_from_parent
    /// [`parent_index`]: Self::parent_index
    /// [§3.32.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317713
    /// [§3.32.13]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718
    ///
    /// <pre>
    /// FUNCTION calculate_absolute_address(addr)
    ///     IF addr.absolute_address exists THEN
    ///         RETURN addr.absolute_address
    ///     ELSE IF addr.parent_index exists THEN
    ///         LET theParent = the parent object (see <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317707">§3.32.2</a>) of addr
    ///         RETURN addr.offset_from_parent + calculate_absolute_address(theParent)
    ///     ELSE
    ///         ERROR "Absolute address cannot be determined".
    /// </pre>
    ///
    /// If `calculate_absolute_address(self)` or any of its recursive invocations encounters an
    /// error, the absolute address cannot be determined. If both [`absolute_address`] and
    /// [`offset_from_parent`] exist, then [`absolute_address`] **shall** equal the value that
    /// `calculate_absolute_address` would have returned if [`absolute_address`] were absent, if
    /// `calculate_absolute_address` would have returned successfully in that circumstance.
    ///
    /// [`absolute_address`]: Self::absolute_address
    /// [`offset_from_parent`]: Self::offset_from_parent
    ///
    /// See [SARIF specification §3.32.3](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317708)
    ///
    /// ---
    ///
    /// # Note
    ///
    /// `calculate_absolute_address` always calculates the absolute address of the `Address` object,
    /// it will never return the value of the `absolute_address` property.
    ///
    /// # Errors
    ///
    /// - [`ParentIndexAbsent`] if [`parent_index`] property is absent.
    /// - [`ParentIndexOutOfBounds`] if the [`parent_index`] property does not exist in the provided
    ///   `addresses` array.
    /// - [`OffsetFromParentNotPresent`] if the [`offset_from_parent`] property is absent.
    /// - [`Overflow`] if the [`offset_from_parent`] property is too large.
    /// - [`Underflow`] if the [`offset_from_parent`] property is too small.
    ///
    /// [`ParentIndexAbsent`]: AddressCalculationError::ParentIndexAbsent
    /// [`ParentIndexOutOfBounds`]: AddressCalculationError::ParentIndexOutOfBounds
    /// [`OffsetFromParentNotPresent`]: AddressCalculationError::OffsetFromParentAbsent
    /// [`Overflow`]: AddressCalculationError::Overflow
    /// [`Underflow`]: AddressCalculationError::Underflow
    ///
    /// # Example
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use sarif::schema::Run;
    /// let run = Run::deserialize(json!({
    ///  "addresses": [
    ///     {
    ///       "name": "Multitool.exe",
    ///       "kind": "module",
    ///       "absoluteAddress": 1024
    ///     },
    ///     {
    ///       "name": "Sections",
    ///       "kind": "header",
    ///       "parentIndex": 0,
    ///       "offsetFromParent": 376,
    ///       "absoluteAddress": 1400,
    ///       "relativeAddress": 376
    ///     },
    ///     {
    ///       "name": ".text",
    ///       "kind": "section",
    ///       "parentIndex": 1,
    ///       "offsetFromParent": 136,
    ///       "absoluteAddress": 1536,
    ///       "relativeAddress": 512
    ///     }
    ///   ],
    /// # "properties": { "hidden": "
    ///   ...
    /// # " }, "tool": { "driver": { "name": "Multitool.exe" } }
    /// }))?;
    ///
    /// assert_eq!(run.addresses[0].calculate_absolute_address(&run).ok(), None);
    /// assert_eq!(
    ///     run.addresses[1].calculate_absolute_address(&run).ok(),
    ///     run.addresses[1].absolute_address
    /// );
    /// assert_eq!(
    ///     run.addresses[2].calculate_absolute_address(&run).ok(),
    ///     run.addresses[2].absolute_address
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    pub fn calculate_absolute_address(
        &self,
        run: &Run<'_>,
    ) -> Result<usize, AddressCalculationError> {
        let parent_index = self
            .parent_index
            .ok_or(AddressCalculationError::ParentIndexAbsent)?;

        let parent = run
            .addresses
            .get(parent_index)
            .ok_or(AddressCalculationError::ParentIndexOutOfBounds)?;

        let parent_address = if let Some(parent_address) = parent.absolute_address {
            parent_address
        } else {
            parent.calculate_absolute_address(run)?
        };

        let offset_from_parent = self
            .offset_from_parent
            .ok_or(AddressCalculationError::OffsetFromParentAbsent)?;

        parent_address
            .checked_add_signed(offset_from_parent)
            .ok_or_else(|| {
                if offset_from_parent.is_positive() {
                    AddressCalculationError::Overflow
                } else {
                    AddressCalculationError::Underflow
                }
            })
    }

    /// Returns or calculates the relative address of this `Address`.
    ///
    /// Each address object has an associated value called its “relative address” which is the
    /// offset of the address from the address of the top-most object in its parent chain. The
    /// relative address is calculated by executing the function as shown below or by any procedure
    /// with the same result.
    ///
    /// This procedure assumes that the [`offset_from_parent`] ([§3.32.8]) and [`parent_index`]
    /// ([§3.32.13]) properties are either both present or both absent; if this is not the case,
    /// the SARIF file is invalid.
    ///
    /// [`offset_from_parent`]: Self::offset_from_parent
    /// [`parent_index`]: Self::parent_index
    /// [§3.32.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317713
    /// [§3.32.13]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317718
    ///
    /// <pre>
    /// FUNCTION calculate_relative_address(addr)
    ///     IF addr.relative_address exists THEN
    ///         RETURN addr.relative_address
    ///     ELSE IF addr.parent_index exists THEN
    ///         LET theParent = the parent object (see <a href="https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317707">§3.32.2</a>) of addr
    ///         RETURN addr.offset_from_parent + calculate_relative_address(theParent)
    ///     ELSE
    ///         RETURN 0
    /// </pre>
    ///
    /// If `calculate_relative_address(self)` or any of its recursive invocations encounters an
    /// error, the relative address cannot be determined. If both [`relative_address`] and
    /// [`offset_from_parent`] exist, then [`relative_address`] **shall** equal the value that
    /// `calculate_relative_address` would have returned if [`relative_address`] were absent, if
    /// `calculate_relative_address` would have returned successfully in that circumstance.
    ///
    /// [`relative_address`]: Self::relative_address
    /// [`offset_from_parent`]: Self::offset_from_parent
    ///
    /// See [SARIF specification §3.32.4](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317709)
    ///
    /// ---
    ///
    /// # Note
    ///
    /// `calculate_relative_address` always calculates the relative address of the `Address` object,
    /// it will never return the value of the `relative_address` property.
    ///
    /// # Errors
    ///
    /// - [`ParentIndexOutOfBounds`] if the [`parent_index`] property does not exist in the provided
    ///   `addresses` array.
    /// - [`OffsetFromParentNotPresent`] if the [`offset_from_parent`] property is absent.
    /// - [`Overflow`] if the [`offset_from_parent`] property is too large.
    ///
    /// [`ParentIndexOutOfBounds`]: AddressCalculationError::ParentIndexOutOfBounds
    /// [`OffsetFromParentNotPresent`]: AddressCalculationError::OffsetFromParentAbsent
    /// [`Overflow`]: AddressCalculationError::Overflow
    ///
    /// # Example
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use sarif::schema::Run;
    /// let run = Run::deserialize(json!({
    ///  "addresses": [
    ///     {
    ///       "name": "Multitool.exe",
    ///       "kind": "module",
    ///       "absoluteAddress": 1024
    ///     },
    ///     {
    ///       "name": "Sections",
    ///       "kind": "header",
    ///       "parentIndex": 0,
    ///       "offsetFromParent": 376,
    ///       "absoluteAddress": 1400,
    ///       "relativeAddress": 376
    ///     },
    ///     {
    ///       "name": ".text",
    ///       "kind": "section",
    ///       "parentIndex": 1,
    ///       "offsetFromParent": 136,
    ///       "absoluteAddress": 1536,
    ///       "relativeAddress": 512
    ///     }
    ///   ],
    /// # "properties": { "hidden": "
    ///   ...
    /// # " }, "tool": { "driver": { "name": "Multitool.exe" } }
    /// }))?;
    ///
    /// assert_eq!(run.addresses[0].calculate_relative_address(&run)?, 0);
    /// assert_eq!(
    ///     run.addresses[1].calculate_relative_address(&run).ok(),
    ///     run.addresses[1].relative_address
    /// );
    /// assert_eq!(
    ///     run.addresses[2].calculate_relative_address(&run).ok(),
    ///     run.addresses[2].relative_address
    /// );
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn calculate_relative_address(
        &self,
        run: &Run<'_>,
    ) -> Result<isize, AddressCalculationError> {
        let Some(parent_index) = self.parent_index else { return Ok(0); };

        let parent = run
            .addresses
            .get(parent_index)
            .ok_or(AddressCalculationError::ParentIndexOutOfBounds)?;

        let parent_address = if let Some(parent_address) = parent.relative_address {
            parent_address
        } else {
            parent.calculate_relative_address(run)?
        };

        let offset_from_parent = self
            .offset_from_parent
            .ok_or(AddressCalculationError::OffsetFromParentAbsent)?;

        parent_address
            .checked_add(offset_from_parent)
            .ok_or(AddressCalculationError::Overflow)
    }

    /// Validates the `Address` object.
    ///
    /// # Errors
    ///
    /// - [`RelativeAddressPresent`] if the [`relative_address`] property is present and the
    ///   [`parent_index`] property is absent.
    /// - [`OffsetFromParentPresent`] if the [`offset_from_parent`] property is present and the
    ///   [`parent_index`] property is absent.
    /// - If `run` is provided:
    ///    - [`IndexOutOfBounds`] if the [`index`] property is out of bounds in `run.addresses`.
    ///    - [`parent_index`] and [`offset_from_parent`] is present:
    ///      - [`AbsoluteAddressMismatch`] if the [`absolute_address`] property is present and the
    ///        output of [`calculate_absolute_address`] does not match the value of the
    ///        [`absolute_address`] property.
    ///      - [`RelativeAddressMismatch`] if the [`relative_address`] property is present and the
    ///        output of [`calculate_relative_address`] does not match the value of the
    ///        [`relative_address`] property.
    ///      - [`AddressCalculationError`] if the [`relative_address`] or [`absolute_address`]
    ///        property could not be calculated.
    ///
    /// Note, that it's not an error, if the [`relative_address`] or [`absolute_address`] property
    /// could not be calculated, but the [`parent_index`] and [`offset_from_parent`] property is
    /// absent ([§3.32.8]).
    ///
    /// [`RelativeAddressPresent`]: AddressValidationError::RelativeAddressPresent
    /// [`OffsetFromParentPresent`]: AddressValidationError::OffsetFromParentPresent
    /// [`AbsoluteAddressMismatch`]: AddressValidationError::AbsoluteAddressMismatch
    /// [`RelativeAddressMismatch`]: AddressValidationError::RelativeAddressMismatch
    /// [`IndexOutOfBounds`]: AddressValidationError::IndexOutOfBounds
    /// [`AddressCalculationError`]: AddressValidationError::AddressCalculationError
    /// [`calculate_absolute_address`]: Self::calculate_absolute_address
    /// [`calculate_relative_address`]: Self::calculate_relative_address
    /// [`index`]: Self::index
    /// [`parent_index`]: Self::parent_index
    /// [`offset_from_parent`]: Self::offset_from_parent
    /// [`relative_address`]: Self::relative_address
    /// [`offset_from_parent`]: Self::offset_from_parent
    /// [`absolute_address`]: Self::absolute_address
    /// [§3.32.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317713
    ///
    /// # Example
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use sarif::schema::Run;
    /// let run = Run::deserialize(json!({
    ///  "addresses": [
    ///     {
    ///       "name": "Multitool.exe",
    ///       "kind": "module",
    ///       "index": 0,
    ///       "absoluteAddress": 1024
    ///     },
    ///     {
    ///       "name": "Sections",
    ///       "kind": "header",
    ///       "parentIndex": 0,
    ///       "offsetFromParent": 376,
    ///       "absoluteAddress": 1400,
    ///       "relativeAddress": 376
    ///     },
    ///     {
    ///       "name": ".text",
    ///       "kind": "section",
    ///       "index": 2,
    ///       "parentIndex": 1,
    ///       "offsetFromParent": 136,
    ///       "absoluteAddress": 1536,
    ///       "relativeAddress": 512
    ///     }
    ///   ],
    /// # "properties": { "hidden": "
    ///   ...
    /// # " }, "tool": { "driver": { "name": "Multitool.exe" } }
    /// }))?;
    ///
    /// for address in &run.addresses {
    ///     address.validate(Some(&run))?;
    /// }
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn validate(&self, run: Option<&Run<'_>>) -> Result<(), AddressValidationError> {
        if self.parent_index.is_none() {
            if self.relative_address.is_some() {
                return Err(AddressValidationError::RelativeAddressPresent);
            }
            if self.offset_from_parent.is_some() {
                return Err(AddressValidationError::OffsetFromParentPresent);
            }
        }

        if let Some(run) = run {
            if let Some(index) = self.index {
                if index >= run.addresses.len() {
                    return Err(AddressValidationError::IndexOutOfBounds);
                }
            }

            if self.parent_index.is_some() && self.offset_from_parent.is_some() {
                let calculated_absolute_address = self.calculate_absolute_address(run)?;
                if let Some(absolute_address) = self.absolute_address {
                    if absolute_address != calculated_absolute_address {
                        return Err(AddressValidationError::AbsoluteAddressMismatch);
                    }
                }

                let calculated_relative_address = self.calculate_relative_address(run)?;
                if let Some(relative_address) = self.relative_address {
                    if relative_address != calculated_relative_address {
                        return Err(AddressValidationError::RelativeAddressMismatch);
                    }
                }
            }
        }

        Ok(())
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.index.is_none()
            && self.absolute_address.is_none()
            && self.relative_address.is_none()
            && self.offset_from_parent.is_none()
            && self.length.is_none()
            && self.name.is_none()
            && self.fully_qualified_name.is_none()
            && self.kind.is_none()
            && self.parent_index.is_none()
            && self.properties.is_empty()
    }
}
