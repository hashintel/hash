//! Display payloads a dataset supplies beside its row identities.
//!
//! An identity file carries one display value per row in its payload region, stored as raw
//! bytes and read back as the typed view the id type declares through
//! [`Key::Payload`](crate::file::identity::Key::Payload). [`Legend`] is the display value of a
//! node or edge row - the row's representative ontology type beside its display label - and
//! [`Icon`] the display value of an ontology-type row. Text is UTF-8 at byte level, so casting
//! a payload span validates it and rejects a span that holds anything else. A row that
//! displays nothing carries its type's empty value: the empty icon, or a legend whose label
//! is empty.

use alloc::sync::Arc;
use core::{borrow::Borrow, clone::CloneToUninit, mem::offset_of, ops::Deref};

use zerocopy::FromZeros as _;

use crate::identity::OntologyRowId;

/// The display payload of a node or edge row.
///
/// A legend pairs a row's representative ontology type with the row's display label. Which
/// type represents a row is the dataset's contract. Reading a legend out of a payload
/// region validates the label bytes as UTF-8 and rejects a span shorter than the
/// representative header. The legend of a row that displays nothing carries the empty label.
#[derive(
    Debug,
    zerocopy::ByteEq,
    zerocopy::FromZeros,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct Legend {
    representative_ontology: OntologyRowId,
    label: Label,
}

impl Legend {
    /// Returns the ontology row of the type standing for the row.
    pub(crate) const fn representative_ontology(&self) -> OntologyRowId {
        self.representative_ontology
    }

    /// Views the display text.
    pub(crate) const fn label(&self) -> &Label {
        &self.label
    }
}

const _: () = {
    assert!(align_of::<OntologyRowId>() == 1);
    assert!(offset_of!(Legend, representative_ontology) == 0);
};

// SAFETY: `repr(C)` with `OntologyRowId` (`Unaligned` + `IntoBytes`) followed by `str` gives
// every field alignment 1, so no padding exists at any length and every byte of the value is
// initialized. The derive cannot compute this because its padding proof sizes each field and
// special-cases only a trailing slice. `str` is layout-identical to `[u8]` but not a slice type.
unsafe impl zerocopy::IntoBytes for Legend {
    fn only_derive_is_allowed_to_implement_this_trait() {}
}

// SAFETY: the implementation writes the label at its in-value offset and the representative at
// offset 0. `repr(C)` at alignment 1 puts no padding between them, so the two writes
// initialize every byte of the clone and `dest` holds a valid `Legend` on return.
unsafe impl CloneToUninit for Legend {
    unsafe fn clone_to_uninit(&self, dest: *mut u8) {
        // SAFETY: `self.label` is a field of `self`, so both pointers lie in one allocation
        // with the field's address not below the value's.
        let offset_of_label = unsafe { (&raw const self.label).byte_offset_from_unsigned(self) };

        // SAFETY: the caller provides `dest` valid for `size_of_val(self)` bytes at alignment
        // 1; the label's span and the representative's eight bytes at offset 0 both lie inside
        // that span.
        unsafe {
            self.label.clone_to_uninit(dest.add(offset_of_label));
            dest.add(offset_of!(Self, representative_ontology))
                .cast::<OntologyRowId>()
                .write(self.representative_ontology);
        }
    }
}

impl ToOwned for Legend {
    type Owned = OwnedLegend;

    fn to_owned(&self) -> Self::Owned {
        OwnedLegend(Box::clone_from_ref(self))
    }
}

/// The owned display payload of a node or edge row.
///
/// An `OwnedLegend` is to [`Legend`] what `String` is to `str`: dataset streams deliver owned
/// legends, and borrowing one yields the payload view an identity write persists.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct OwnedLegend(Box<Legend>);

impl OwnedLegend {
    /// Creates the legend pairing `representative` with `label`.
    pub(crate) fn new(representative: OntologyRowId, label: &Label) -> Self {
        let mut boxed = Legend::new_box_zeroed_with_elems(label.len())
            .expect("a label's length fits the allocator's limits");
        boxed.representative_ontology = representative;

        // SAFETY: the write copies the bytes of a valid `&Label` whole, so the field holds
        // valid UTF-8 when the borrow ends.
        unsafe { boxed.label.0.as_bytes_mut() }.copy_from_slice(label.as_bytes());
        Self(boxed)
    }

    /// Returns the legend's retained heap in bytes: the representative header and the label text.
    pub(crate) fn heap_bytes(&self) -> u64 {
        size_of_val(&*self.0) as u64
    }
}

impl Clone for OwnedLegend {
    fn clone(&self) -> Self {
        Self(Box::clone_from_ref(&self.0))
    }
}

const impl Deref for OwnedLegend {
    type Target = Legend;

    fn deref(&self) -> &Legend {
        &self.0
    }
}

impl AsRef<Legend> for OwnedLegend {
    fn as_ref(&self) -> &Legend {
        &self.0
    }
}

impl Borrow<Legend> for OwnedLegend {
    fn borrow(&self) -> &Legend {
        &self.0
    }
}

/// The display text of a node or edge row.
///
/// A `Label` is UTF-8 text. Reading one out of a payload region validates the bytes, and the
/// empty label is the display of a row that has none.
#[derive(
    Debug,
    zerocopy::ByteEq,
    zerocopy::IntoBytes,
    zerocopy::FromZeros,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
// `repr(C)`: the `KnownLayout` derive supports an unsized struct only under it.
#[repr(C)]
pub(crate) struct Label(str);

impl Label {
    /// The empty label, the display of a row that has none.
    pub(crate) const EMPTY: &'static Self = Self::new("");

    /// Views `text` as a label, in place.
    pub(crate) const fn new(text: &str) -> &Self {
        let ptr = &raw const *text;
        let ptr = ptr as *const Self;

        // SAFETY: `Label` is `repr(C)` with `str` as its only field, so it has `str`'s size,
        // alignment, and pointer metadata, and the cast keeps the address, length metadata, and
        // provenance of `text`. The target is therefore a live, validly initialized `Label` whose
        // borrow is `text`'s.
        unsafe { &*ptr }
    }
}

// SAFETY: `Label` is `repr(C)` around `str` alone, so its clone is its text's clone and
// `str`'s implementation initializes every byte of `dest`.
unsafe impl CloneToUninit for Label {
    unsafe fn clone_to_uninit(&self, dest: *mut u8) {
        // SAFETY: `Label` has `str`'s size and alignment, so the caller's contract for this
        // value is `str`'s contract for its text.
        unsafe {
            <str as CloneToUninit>::clone_to_uninit(&self.0, dest);
        }
    }
}

const impl Deref for Label {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

const impl AsRef<str> for Label {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

const impl PartialEq<str> for Label {
    fn eq(&self, other: &str) -> bool {
        &self.0 == other
    }
}

impl ToOwned for Label {
    type Owned = OwnedLabel;

    fn to_owned(&self) -> Self::Owned {
        OwnedLabel::from(&self.0)
    }
}

/// The owned display text of a node or edge row.
///
/// An `OwnedLabel` is to [`Label`] what `String` is to `str`: dataset streams deliver owned
/// labels, and borrowing one yields the payload view an identity write persists. The empty
/// label is the display of a row that has none.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct OwnedLabel(Arc<str>);

impl From<String> for OwnedLabel {
    #[inline]
    fn from(text: String) -> Self {
        Self(Arc::from(text))
    }
}

impl From<&str> for OwnedLabel {
    #[inline]
    fn from(text: &str) -> Self {
        Self(Arc::from(text))
    }
}

impl Borrow<Label> for OwnedLabel {
    fn borrow(&self) -> &Label {
        Label::new(&self.0)
    }
}

impl Deref for OwnedLabel {
    type Target = Label;

    fn deref(&self) -> &Label {
        Label::new(&self.0)
    }
}

/// The icon of an ontology-type row.
///
/// An `Icon` is UTF-8 text. Reading one out of a payload region validates the bytes, and the
/// empty icon is the display of a row that has none.
#[derive(
    Debug,
    zerocopy::ByteEq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
// `repr(C)`: the `KnownLayout` derive supports an unsized struct only under it.
#[repr(C)]
pub(crate) struct Icon(str);

impl Icon {
    /// Views `text` as an icon, in place.
    pub(crate) const fn new(text: &str) -> &Self {
        let ptr = &raw const *text;
        let ptr = ptr as *const Self;

        // SAFETY: `Icon` is `repr(C)` with `str` as its only field, so it has `str`'s size,
        // alignment, and pointer metadata, and the cast keeps the address, length metadata, and
        // provenance of `text`. The target is therefore a live, validly initialized `Icon` whose
        // borrow is `text`'s.
        unsafe { &*ptr }
    }

    pub(crate) const fn empty() -> &'static Self {
        const EMPTY: &Icon = Icon::new("");

        EMPTY
    }
}

impl AsRef<str> for Icon {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl ToOwned for Icon {
    type Owned = OwnedIcon;

    fn to_owned(&self) -> Self::Owned {
        OwnedIcon::from(&self.0)
    }
}

/// The owned display icon of an ontology-type row.
///
/// An `OwnedIcon` is to [`Icon`] what `String` is to `str`: dataset streams deliver owned
/// icons, and borrowing one yields the payload view an identity write persists. The empty
/// icon is the display of a row that has none.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct OwnedIcon(Arc<str>);

impl From<String> for OwnedIcon {
    #[inline]
    fn from(text: String) -> Self {
        Self(Arc::from(text))
    }
}

impl From<&str> for OwnedIcon {
    #[inline]
    fn from(text: &str) -> Self {
        Self(Arc::from(text))
    }
}

impl Borrow<Icon> for OwnedIcon {
    fn borrow(&self) -> &Icon {
        Icon::new(&self.0)
    }
}

impl Deref for OwnedIcon {
    type Target = Icon;

    fn deref(&self) -> &Icon {
        Icon::new(&self.0)
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]
    use core::ptr;

    use hashql_core::id::Id as _;
    use zerocopy::{IntoBytes as _, TryFromBytes as _};

    use super::{Icon, Label, Legend, OwnedIcon, OwnedLabel, OwnedLegend};
    use crate::identity::OntologyRowId;

    #[test]
    fn legend_payload_reads_validate() {
        let representative = OntologyRowId::from_usize(7);
        let owned = OwnedLegend::new(representative, Label::new("naïve 🦀"));
        let legend: &Legend = owned.as_ref();
        assert_eq!(legend.representative_ontology(), representative);
        assert_eq!(legend.label(), "naïve 🦀");

        let bytes = legend.as_bytes();
        assert_eq!(bytes.len(), 8 + "naïve 🦀".len());
        let back = Legend::try_ref_from_bytes(bytes).expect("wrote valid bytes");
        assert_eq!(back.representative_ontology(), representative);
        assert_eq!(back.label(), "naïve 🦀");

        let mut corrupt = bytes.to_vec();
        corrupt[8] = 0xFF;
        Legend::try_ref_from_bytes(&corrupt).expect_err("invalid UTF-8 in the label");

        for len in 1..8 {
            Legend::try_ref_from_bytes(&bytes[..len]).expect_err("shorter than the header");
        }

        let empty = OwnedLegend::new(representative, Label::new(""));
        assert_eq!(empty.as_ref().as_bytes().len(), 8);
        assert_eq!(empty.as_ref().label(), "");

        let reowned = legend.to_owned();
        assert_eq!(reowned.as_ref().as_bytes(), bytes);
        assert_eq!(reowned, owned.clone());
    }

    /// Every UTF-8 shape the cast has to carry: empty, ASCII, two-byte, combining mark, and a
    /// four-byte scalar.
    const SHAPES: [&str; 5] = ["", "a", "naïve", "z\u{0301}", "🦀 crab"];

    #[test]
    fn label_views_the_source_text_in_place() {
        for text in SHAPES {
            let label = Label::new(text);
            assert_eq!(label.as_bytes(), text.as_bytes());
            assert_eq!(size_of_val(label), text.len());
            assert_eq!(align_of_val(label), 1);
            assert!(ptr::eq(label.as_bytes().as_ptr(), text.as_ptr()));
        }
    }

    #[test]
    fn icon_views_the_source_text_in_place() {
        for text in SHAPES {
            let icon = Icon::new(text);
            assert_eq!(icon.as_bytes(), text.as_bytes());
            assert_eq!(size_of_val(icon), text.len());
            assert_eq!(align_of_val(icon), 1);
            assert!(ptr::eq(icon.as_bytes().as_ptr(), text.as_ptr()));
        }
    }

    #[test]
    fn owned_label_borrow_and_deref_are_one_view() {
        for text in SHAPES {
            let owned = OwnedLabel::from(text);
            let borrowed: &Label = core::borrow::Borrow::borrow(&owned);
            let dereffed: &Label = &owned;
            assert!(ptr::eq(borrowed, dereffed));
            assert_eq!(borrowed.as_bytes(), text.as_bytes());
        }
    }

    #[test]
    fn owned_icon_borrow_and_deref_are_one_view() {
        for text in SHAPES {
            let owned = OwnedIcon::from(text);
            let borrowed: &Icon = core::borrow::Borrow::borrow(&owned);
            let dereffed: &Icon = &owned;
            assert!(ptr::eq(borrowed, dereffed));
            assert_eq!(borrowed.as_bytes(), text.as_bytes());
        }
    }

    #[test]
    fn to_owned_round_trips_both_entry_points() {
        for text in SHAPES {
            assert_eq!(Label::new(text).to_owned(), OwnedLabel::from(text));
            assert_eq!(Icon::new(text).to_owned(), OwnedIcon::from(text));
            assert_eq!(OwnedLabel::from(String::from(text)), OwnedLabel::from(text));
            assert_eq!(OwnedIcon::from(String::from(text)), OwnedIcon::from(text));
        }
    }

    #[test]
    fn payload_reads_validate_utf8() {
        for text in SHAPES {
            assert_eq!(
                Label::try_ref_from_bytes(text.as_bytes()).expect("valid UTF-8 is a valid label"),
                Label::new(text),
            );
            assert_eq!(
                Icon::try_ref_from_bytes(text.as_bytes()).expect("valid UTF-8 is a valid icon"),
                Icon::new(text),
            );
        }

        Label::try_ref_from_bytes(&[0xFF]).expect_err("invalid UTF-8 is not a valid label");
        Icon::try_ref_from_bytes(&[0xC0, 0x80]).expect_err("invalid UTF-8 is not a valid icon");
    }
}
