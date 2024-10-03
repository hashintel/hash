use alloc::sync::Arc;
use core::cmp;
#[cfg(feature = "postgres")]
use core::error::Error;
use std::collections::{HashMap, hash_map::Entry};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};

use crate::{
    Valid,
    schema::{DataType, DataTypeId, data_type::DataTypeEdge},
    url::VersionedUrl,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
// #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
pub struct ClosedDataType {
    #[serde(flatten)]
    pub schema: Arc<DataType>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty", rename = "$defs")]
    pub definitions: HashMap<VersionedUrl, Arc<DataType>>,
}

impl ClosedDataType {
    #[must_use]
    pub fn data_type(&self) -> &Valid<DataType> {
        // Valid closed schemas imply that the schema is valid
        Valid::new_ref_unchecked(&self.schema)
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct InheritanceDepth(u16);

impl InheritanceDepth {
    #[must_use]
    pub const fn new(inner: u16) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(self) -> u16 {
        self.0
    }
}

#[cfg(feature = "postgres")]
impl ToSql for InheritanceDepth {
    postgres_types::accepts!(INT4);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i32::from(self.0).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for InheritanceDepth {
    postgres_types::accepts!(INT4);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i32::from_sql(ty, raw)?.try_into()?))
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct DataTypeInheritanceData {
    pub inheritance_depths: HashMap<DataTypeId, InheritanceDepth>,
}

impl DataTypeInheritanceData {
    pub fn add_edge(&mut self, edge: DataTypeEdge, target: DataTypeId, depth: u16) {
        match edge {
            DataTypeEdge::Inheritance => match self.inheritance_depths.entry(target) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = InheritanceDepth::new(cmp::min(depth, entry.get().inner()));
                }
                Entry::Vacant(entry) => {
                    entry.insert(InheritanceDepth::new(depth));
                }
            },
        }
    }
}
