mod error;
pub(in crate::ontology) mod raw;

use std::collections::{hash_map::Entry, HashMap};

pub use error::ParseLinksError;
use serde::{Deserialize, Serialize};

use crate::{url::VersionedUrl, ArraySchema, EntityTypeReference, OneOfSchema};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "raw::Links", into = "raw::Links")]
pub struct Links(HashMap<VersionedUrl, ArraySchema<Option<OneOfSchema<EntityTypeReference>>>>);

impl Links {
    /// Creates a new `Links` object.
    #[must_use]
    pub const fn new(
        links: HashMap<VersionedUrl, ArraySchema<Option<OneOfSchema<EntityTypeReference>>>>,
    ) -> Self {
        Self(links)
    }

    #[must_use]
    pub const fn links(
        &self,
    ) -> &HashMap<VersionedUrl, ArraySchema<Option<OneOfSchema<EntityTypeReference>>>> {
        &self.0
    }
}

impl Extend<Self> for Links {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for (id, new_destinations) in iter.into_iter().flat_map(|links| links.0) {
            match self.0.entry(id) {
                Entry::Vacant(entry) => {
                    entry.insert(new_destinations);
                }
                Entry::Occupied(mut entry) => {
                    let entry = entry.get_mut();
                    let existing_destination_items = &mut entry.items;
                    let new_destination_items = new_destinations.items;

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

                    match (new_destinations.min_items, entry.min_items) {
                        (Some(min_items), Some(existing_min_items)) => {
                            entry.min_items = Some(existing_min_items.max(min_items));
                        }
                        (Some(_), None) => {
                            entry.min_items = new_destinations.min_items;
                        }
                        (None, _) => {}
                    }
                    match (new_destinations.max_items, entry.max_items) {
                        (Some(max_items), Some(existing_max_items)) => {
                            entry.max_items = Some(existing_max_items.min(max_items));
                        }
                        (Some(_), None) => {
                            entry.max_items = new_destinations.max_items;
                        }
                        (None, _) => {}
                    }
                }
            }
        }
    }
}

impl FromIterator<Self> for Links {
    fn from_iter<I: IntoIterator<Item = Self>>(iter: I) -> Self {
        let mut default = Self::default();
        default.extend(iter);
        default
    }
}
