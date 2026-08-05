//! Display payloads a dataset supplies beside its row identities.
//!
//! An identity file carries one display value per row in its payload region, stored as raw
//! bytes and read back as the typed view the id type declares through
//! [`Key::Payload`](crate::file::identity::Key::Payload). [`Label`] is the display value of a
//! node or edge row and [`Icon`] the display value of an ontology-type row. Both are UTF-8
//! text at byte level, so casting a payload span to either type validates UTF-8 and rejects a
//! span that holds anything else. A row that displays nothing carries the empty value.

use alloc::sync::Arc;
use core::{borrow::Borrow, ops::Deref};

/// The display text of a node or edge row.
///
/// A `Label` is UTF-8 text. Reading one out of a payload region validates the bytes, and the
/// empty label is the display of a row that has none.
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
pub(crate) struct Label(str);

impl Label {
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

    use zerocopy::{IntoBytes as _, TryFromBytes as _};

    use super::{Icon, Label, OwnedIcon, OwnedLabel};

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
