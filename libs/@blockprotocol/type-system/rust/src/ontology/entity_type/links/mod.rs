mod error;
pub(in crate::ontology) mod raw;
#[cfg(target_arch = "wasm32")]
mod wasm;

use std::{
    collections::{hash_map::Entry, HashMap},
    num::NonZero,
};

pub use error::ParseLinksError;

use crate::{
    url::{BaseUrl, VersionedUrl},
    Array, EntityTypeReference, OneOf, ValidateUrl, ValidationError,
};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Links(
    pub(crate) HashMap<VersionedUrl, MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>>,
);

impl Links {
    /// Creates a new `Links` object.
    #[must_use]
    pub const fn new(
        links: HashMap<VersionedUrl, MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>>,
    ) -> Self {
        Self(links)
    }

    #[must_use]
    pub const fn links(
        &self,
    ) -> &HashMap<VersionedUrl, MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>> {
        &self.0
    }
}

impl FromIterator<Self> for Links {
    fn from_iter<I: IntoIterator<Item = Self>>(iter: I) -> Self {
        let mut links = HashMap::<_, MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>>::new();
        for (id, new_destinations) in iter.into_iter().flat_map(|links| links.0) {
            match links.entry(id) {
                Entry::Vacant(entry) => {
                    entry.insert(new_destinations);
                }
                Entry::Occupied(mut entry) => {
                    let entry = entry.get_mut();
                    let existing_destination_items = &mut entry.array.items;
                    let new_destination_items = new_destinations.array.items;

                    match (
                        new_destination_items.as_ref(),
                        existing_destination_items.as_mut(),
                    ) {
                        (Some(destinations), Some(existing_destinations)) => {
                            existing_destinations
                                .possibilities
                                .retain(|existing_destination| {
                                    destinations.possibilities.contains(existing_destination)
                                });
                        }
                        (Some(_), None) => {
                            *existing_destination_items = new_destination_items;
                        }
                        (None, _) => {}
                    }

                    if new_destinations.ordered {
                        entry.ordered = true;
                    }
                    match (new_destinations.array.min_items, entry.array.min_items) {
                        (Some(min_items), Some(existing_min_items)) => {
                            entry.array.min_items = Some(existing_min_items.max(min_items));
                        }
                        (Some(_), None) => {
                            entry.array.min_items = new_destinations.array.min_items;
                        }
                        (None, _) => {}
                    }
                    match (new_destinations.array.max_items, entry.array.max_items) {
                        (Some(max_items), Some(existing_max_items)) => {
                            entry.array.max_items = Some(existing_max_items.min(max_items));
                        }
                        (Some(_), None) => {
                            entry.array.max_items = new_destinations.array.max_items;
                        }
                        (None, _) => {}
                    }
                }
            }
        }
        Self(links)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaybeOrderedArray<T> {
    pub array: Array<T>,
    pub ordered: bool,
}

impl<T> MaybeOrderedArray<T> {
    #[must_use]
    pub const fn new(
        ordered: bool,
        items: T,
        min_items: Option<usize>,
        max_items: Option<NonZero<usize>>,
    ) -> Self {
        Self {
            array: Array::new(items, min_items, max_items),
            ordered,
        }
    }

    #[must_use]
    pub const fn array(&self) -> &Array<T> {
        &self.array
    }

    #[must_use]
    pub const fn ordered(&self) -> bool {
        self.ordered
    }
}

impl<T: ValidateUrl> ValidateUrl for MaybeOrderedArray<T> {
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError> {
        self.array().items().validate_url(base_url)
    }
}
