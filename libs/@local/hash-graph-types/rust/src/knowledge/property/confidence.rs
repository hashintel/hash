use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::knowledge::{Confidence, PropertyPatchOperation, PropertyPath};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyConfidence<'a> {
    #[serde(flatten)]
    map: HashMap<PropertyPath<'a>, Confidence>,
}

impl<'a> PropertyConfidence<'a> {
    #[must_use]
    pub const fn new(confidences: HashMap<PropertyPath<'a>, Confidence>) -> Self {
        Self { map: confidences }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.map.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn iter(&self) -> impl Iterator<Item = (&PropertyPath<'a>, &Confidence)> {
        self.map.iter()
    }

    pub fn patch(&mut self, operations: &[PropertyPatchOperation]) {
        for operation in operations {
            match operation {
                PropertyPatchOperation::Remove { path } => {
                    self.map.retain(|key, _| !key.starts_with(path));
                }
                PropertyPatchOperation::Add {
                    path,
                    value: _,
                    confidence,
                }
                | PropertyPatchOperation::Copy {
                    from: _,
                    path,
                    confidence,
                }
                | PropertyPatchOperation::Replace {
                    path,
                    value: _,
                    confidence,
                } => {
                    self.map.retain(|key, _| !key.starts_with(path));
                    if let Some(confidence) = confidence {
                        self.map.insert(path.clone(), *confidence);
                    }
                }
                PropertyPatchOperation::Move {
                    from,
                    path,
                    confidence,
                } => {
                    self.map
                        .retain(|key, _| !key.starts_with(from) && !key.starts_with(path));
                    if let Some(confidence) = confidence {
                        self.map.insert(path.clone(), *confidence);
                    }
                }
                PropertyPatchOperation::Test { path: _, value: _ } => {}
            }
        }
    }
}

impl<'a> IntoIterator for PropertyConfidence<'a> {
    type IntoIter = std::collections::hash_map::IntoIter<PropertyPath<'a>, Confidence>;
    type Item = (PropertyPath<'a>, Confidence);

    fn into_iter(self) -> Self::IntoIter {
        self.map.into_iter()
    }
}

impl<'a, 'p> IntoIterator for &'p PropertyConfidence<'a> {
    type IntoIter = std::collections::hash_map::Iter<'p, PropertyPath<'a>, Confidence>;
    type Item = (&'p PropertyPath<'a>, &'p Confidence);

    fn into_iter(self) -> Self::IntoIter {
        self.map.iter()
    }
}

impl<'a> FromIterator<(PropertyPath<'a>, Confidence)> for PropertyConfidence<'a> {
    fn from_iter<T: IntoIterator<Item = (PropertyPath<'a>, Confidence)>>(iter: T) -> Self {
        Self {
            map: iter.into_iter().collect(),
        }
    }
}
