#[cfg(feature = "serde")]
use alloc::collections::BTreeMap;
use alloc::{borrow::Cow, collections::BTreeSet};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Key/value pairs that provide additional information about the object
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct PropertyBag<'s> {
    /// A set of distinct strings that provide additional information.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub tags: BTreeSet<Cow<'s, str>>,

    /// A dictionary, each of whose keys specifies a distinct additional information element and
    /// each of whose values provides the information.
    #[cfg(feature = "serde")]
    #[serde(flatten, borrow)]
    pub additional: BTreeMap<Cow<'s, str>, serde_json::Value>,
}

impl<'s> PropertyBag<'s> {
    /// Create a new, empty `PropertyBag`.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::PropertyBag;
    ///
    /// let properties = PropertyBag::new();
    ///
    /// assert!(properties.tags.is_empty());
    /// assert!(properties.additional.is_empty());
    /// ```
    #[must_use]
    pub const fn new() -> Self {
        Self {
            tags: BTreeSet::new(),
            #[cfg(feature = "serde")]
            additional: BTreeMap::new(),
        }
    }

    /// Add a tag to the property bag.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::PropertyBag;
    ///
    /// let properties = PropertyBag::default()
    ///     .with_tag("code-quality")
    ///     .with_tag("static-analysis");
    ///
    /// assert!(
    ///     properties
    ///         .tags
    ///         .iter()
    ///         .eq(["code-quality", "static-analysis"])
    /// );
    /// ```
    #[must_use]
    pub fn with_tag(mut self, tag: impl Into<Cow<'s, str>>) -> Self {
        self.tags.insert(tag.into());
        self
    }

    /// Add tags to the property bag.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::PropertyBag;
    ///
    /// let properties = PropertyBag::default().with_tags(["code-quality", "static-analysis"]);
    ///
    /// assert!(
    ///     properties
    ///         .tags
    ///         .iter()
    ///         .eq(["code-quality", "static-analysis"])
    /// );
    /// ```
    #[must_use]
    pub fn with_tags(mut self, tags: impl IntoIterator<Item = impl Into<Cow<'s, str>>>) -> Self {
        self.tags.extend(tags.into_iter().map(Into::into));
        self
    }

    /// Add a property to the property bag.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::PropertyBag;
    ///
    /// let properties = PropertyBag::default()
    ///     .with_property("precision", "very-high")
    ///     .with_property("confidence", "high");
    ///
    /// assert_eq!(
    ///     properties.additional.get("precision"),
    ///     Some(&"very-high".into())
    /// );
    /// assert_eq!(
    ///     properties.additional.get("confidence"),
    ///     Some(&"high".into())
    /// );
    /// ```
    #[must_use]
    #[cfg(feature = "serde")]
    pub fn with_property(
        mut self,
        key: impl Into<Cow<'s, str>>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        self.additional.insert(key.into(), value.into());
        self
    }

    /// Add properties to the property bag.
    ///
    /// # Example
    ///
    /// ```
    /// use std::collections::HashMap;
    ///
    /// use sarif::schema::PropertyBag;
    ///
    /// let map = HashMap::from([("confidence", "high"), ("precision", "very-high")]);
    ///
    /// let properties = PropertyBag::default().with_properties(map);
    ///
    /// assert_eq!(
    ///     properties.additional.get("precision"),
    ///     Some(&"very-high".into())
    /// );
    /// assert_eq!(
    ///     properties.additional.get("confidence"),
    ///     Some(&"high".into())
    /// );
    /// ```
    #[must_use]
    #[cfg(feature = "serde")]
    pub fn with_properties(
        mut self,
        properties: impl IntoIterator<Item = (impl Into<Cow<'s, str>>, impl Into<serde_json::Value>)>,
    ) -> Self {
        self.additional.extend(
            properties
                .into_iter()
                .map(|(key, value)| (key.into(), value.into())),
        );
        self
    }

    /// Returns `true` if the property bag is empty.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::PropertyBag;
    ///
    /// let properties = PropertyBag::default();
    ///
    /// assert!(properties.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        #[cfg_attr(not(feature = "serde"), expect(unused_mut))]
        let mut is_empty = self.tags.is_empty();

        #[cfg(feature = "serde")]
        {
            is_empty &= self.additional.is_empty();
        }
        is_empty
    }
}
