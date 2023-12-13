use std::{borrow::Cow, error::Error};

#[cfg(feature = "postgres")]
use bytes::{BufMut, BytesMut};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(transparent)]
pub struct Embedding<'v>(Cow<'v, [f32]>);

impl Embedding<'_> {
    pub const DIM: usize = 1536;

    pub fn iter(&self) -> impl Iterator<Item = f32> + '_ {
        self.0.iter().copied()
    }

    #[must_use]
    pub fn into_owned(self) -> Embedding<'static> {
        Embedding(Cow::Owned(self.0.into_owned()))
    }

    #[must_use]
    pub fn to_owned(&self) -> Embedding<'static> {
        match self.0 {
            Cow::Borrowed(slice) => Embedding(Cow::Owned(slice.to_owned())),
            Cow::Owned(ref vec) => Embedding(Cow::Owned(vec.clone())),
        }
    }
}

impl FromIterator<f32> for Embedding<'_> {
    fn from_iter<T: IntoIterator<Item = f32>>(iter: T) -> Self {
        Self(Cow::Owned(iter.into_iter().collect()))
    }
}

impl From<Vec<f32>> for Embedding<'_> {
    fn from(vector: Vec<f32>) -> Self {
        Self(Cow::Owned(vector))
    }
}

impl<'v> From<&'v [f32]> for Embedding<'v> {
    fn from(vector: &'v [f32]) -> Self {
        Self(Cow::Borrowed(vector))
    }
}

#[cfg(feature = "postgres")]
impl ToSql for Embedding<'_> {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, _ty: &Type, w: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>> {
        let dim = self.0.len();
        w.put_u16(dim.try_into()?);
        w.put_u16(0);

        for v in self.0.as_ref() {
            w.put_f32(*v);
        }

        Ok(IsNull::No)
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}

#[cfg(feature = "postgres")]
impl<'v> FromSql<'v> for Embedding<'_> {
    #[expect(
        clippy::big_endian_bytes,
        reason = "Postgres always returns big endian"
    )]
    #[expect(
        clippy::missing_asserts_for_indexing,
        reason = "We error if the buffer is too small"
    )]
    fn from_sql(_ty: &Type, buf: &'v [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        if buf.len() < 4 {
            return Err("expected at least 4 bytes".into());
        }
        let dim = u16::from_be_bytes(buf[0..2].try_into()?) as usize;
        let unused = u16::from_be_bytes(buf[2..4].try_into()?);
        if unused != 0 {
            return Err("expected unused to be 0".into());
        }

        let mut vec = Vec::with_capacity(dim);
        for i in 0..dim {
            let s = 4 + 4 * i;
            vec.push(f32::from_be_bytes(buf[s..s + 4].try_into()?));
        }

        Ok(Self(Cow::Owned(vec)))
    }

    fn accepts(ty: &Type) -> bool {
        ty.name() == "vector"
    }
}
