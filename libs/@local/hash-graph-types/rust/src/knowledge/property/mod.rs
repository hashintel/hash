mod diff;
mod metadata;
mod object;
mod patch;
mod path;
mod provenance;

use std::{cmp::Ordering, collections::HashMap, fmt, io};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::BaseUrl, JsonSchemaValueType};

pub use self::{
    diff::PropertyDiff,
    metadata::{PropertyMetadata, PropertyMetadataMap},
    object::PropertyObject,
    patch::PropertyPatchOperation,
    path::{PropertyPath, PropertyPathElement},
    provenance::PropertyProvenance,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum Property {
    Array(Vec<Self>),
    Object(PropertyObject),
    Value(serde_json::Value),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Error)]
#[error("Failed to apply patch")]
pub struct PatchError;

impl Property {
    #[must_use]
    pub fn json_type(&self) -> JsonSchemaValueType {
        match self {
            Self::Array(_) => JsonSchemaValueType::Array,
            Self::Object(_) => JsonSchemaValueType::Object,
            Self::Value(property) => JsonSchemaValueType::from(property),
        }
    }

    pub gen fn properties(&self) -> (PropertyPath<'_>, &JsonValue) {
        let mut elements = PropertyPath::default();
        match self {
            Self::Array(array) => {
                for (index, property) in array.iter().enumerate() {
                    elements.push(index);
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Object(object) => {
                for (key, property) in object.properties() {
                    elements.push(key);
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Value(property) => yield (elements.clone(), property),
        }
    }

    #[must_use]
    pub fn get<'a>(
        &self,
        path: impl IntoIterator<Item = &'a PropertyPathElement<'a>>,
    ) -> Option<&Self> {
        let mut value = self;
        for element in path {
            match element {
                PropertyPathElement::Property(key) => {
                    value = match value {
                        Self::Object(object) => object.properties().get(key)?,
                        _ => return None,
                    };
                }
                PropertyPathElement::Index(index) => {
                    value = match value {
                        Self::Array(array) => array.get(*index)?,
                        _ => return None,
                    };
                }
            }
        }
        Some(value)
    }

    gen fn diff_array<'a>(
        lhs: &'a [Self],
        rhs: &'a [Self],
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (index, (lhs, rhs)) in lhs.iter().zip(rhs).enumerate() {
            path.push(index);
            for yielded in Box::new(lhs.diff(rhs, path)) {
                yield yielded;
            }
            path.pop();
        }

        match lhs.len().cmp(&rhs.len()) {
            Ordering::Less => {
                for (index, property) in rhs.iter().enumerate().skip(lhs.len()) {
                    path.push(index);
                    yield PropertyDiff::Added {
                        path: path.clone(),
                        added: property,
                    };
                    path.pop();
                }
            }
            Ordering::Equal => {}
            Ordering::Greater => {
                for (index, property) in lhs.iter().enumerate().skip(rhs.len()) {
                    path.push(index);
                    yield PropertyDiff::Removed {
                        path: path.clone(),
                        removed: property,
                    };
                    path.pop();
                }
            }
        }
    }

    pub(super) gen fn diff_object<'a>(
        lhs: &'a HashMap<BaseUrl, Self>,
        rhs: &'a HashMap<BaseUrl, Self>,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (key, property) in lhs {
            path.push(key);
            let other_property = rhs.get(key);
            if let Some(other_property) = other_property {
                for yielded in Box::new(property.diff(other_property, path)) {
                    yield yielded;
                }
            } else {
                yield PropertyDiff::Removed {
                    path: path.clone(),
                    removed: property,
                };
            }
            path.pop();
        }
        for (key, property) in rhs {
            if !lhs.contains_key(key) {
                path.push(key);
                yield PropertyDiff::Added {
                    path: path.clone(),
                    added: property,
                };
                path.pop();
            }
        }
    }

    pub gen fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'_> {
        let mut changed = false;
        match (self, other) {
            (Self::Array(lhs), Self::Array(rhs)) => {
                for yielded in Self::diff_array(lhs, rhs, path) {
                    changed = true;
                    yield yielded;
                }
            }
            (Self::Object(lhs), Self::Object(rhs)) => {
                for yielded in Self::diff_object(lhs.properties(), rhs.properties(), path) {
                    changed = true;
                    yield yielded;
                }
            }
            (lhs, rhs) => {
                changed = lhs != rhs;
            }
        }

        if changed {
            yield PropertyDiff::Changed {
                path: path.clone(),
                old: self,
                new: other,
            };
        }
    }
}

impl fmt::Display for Property {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Inspired by `serde_json`
        struct WriterFormatter<'a, 'b: 'a>(&'a mut fmt::Formatter<'b>);

        impl io::Write for WriterFormatter<'_, '_> {
            fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
                self.0
                    .write_str(&String::from_utf8_lossy(buf))
                    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
                Ok(buf.len())
            }

            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }

        if fmt.alternate() {
            serde_json::to_writer_pretty(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        } else {
            serde_json::to_writer(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        }
    }
}

impl PartialEq<JsonValue> for Property {
    fn eq(&self, rhs: &JsonValue) -> bool {
        match self {
            Self::Array(lhs) => {
                let JsonValue::Array(rhs) = rhs else {
                    return false;
                };

                lhs == rhs
            }
            Self::Object(lhs) => {
                let JsonValue::Object(rhs) = rhs else {
                    return false;
                };

                lhs.properties().len() == rhs.len()
                    && lhs.properties().iter().all(|(key, value)| {
                        rhs.get(key.as_str())
                            .map_or(false, |other_value| value == other_value)
                    })
            }
            Self::Value(lhs) => lhs == rhs,
        }
    }
}
