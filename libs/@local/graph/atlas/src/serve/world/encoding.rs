use error_stack::{Report, ResultExt as _};
use hashql_core::id::{Id, IdVec};

use super::{
    super::codec::{RowCodec, RowDomain},
    OpenOptions,
    error::WorldError,
};
use crate::serve::codec::{EncodableId, EncodedRowId};

/// One row domain's codec with the wire ids of the opening domain precomputed.
#[derive(Debug)]
pub(crate) struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<I, EncodedRowId<I>>,
}

impl<I> Encoding<I> {
    /// Derives the codec and precomputes the wire id of every row in `domain`.
    ///
    /// # Complexity
    ///
    /// After codec derivation, precomputation takes O(n) time and retains n wire-ID entries for
    /// n rows in `domain`. Each row requires eight keyed Feistel rounds through
    /// [`RowCodec::encode`].
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] if `domain` contains a row at or beyond
    /// [`WIRE_ROW_BOUND`](crate::serve::codec::WIRE_ROW_BOUND), or its row count exceeds the
    /// address space.
    pub(crate) fn open(
        OpenOptions { generation, secret }: OpenOptions<'_>,
        domain: RowDomain<I>,
    ) -> Result<Self, Report<WorldError>>
    where
        I: EncodableId,
    {
        let rows = domain.bound().as_u64();
        u32::try_from(rows.saturating_sub(1)).change_context(WorldError::TooManyRows { rows })?;
        let rows = usize::try_from(rows).change_context(WorldError::TooManyRows { rows })?;

        let codec = RowCodec::derive(secret.as_ref(), generation.id());
        let lookup = IdVec::from_fn(rows, |id| codec.encode(id));

        Ok(Self { codec, lookup })
    }

    /// Encodes `row` as its wire id.
    ///
    /// # Complexity
    ///
    /// Rows in the opening domain use a table lookup. Later rows require eight keyed Feistel
    /// rounds through [`RowCodec::encode`]. Both paths take O(1) time in the opening row count
    /// and use constant additional space.
    ///
    /// # Panics
    ///
    /// Panics if `row` lies at or beyond
    /// [`WIRE_ROW_BOUND`](crate::serve::codec::WIRE_ROW_BOUND), as [`RowCodec::encode`] does.
    pub(super) fn encode(&self, row: I) -> EncodedRowId<I>
    where
        I: EncodableId,
    {
        if let Some(&encoded) = self.lookup.get(row) {
            return encoded;
        }

        self.codec.encode(row)
    }

    /// Decodes a wire value to a row accepted by `domain`.
    ///
    /// Returns [`None`] when the inverse permutation yields a value outside `I` or `domain`.
    ///
    /// # Complexity
    ///
    /// Every decode applies eight inverse Feistel rounds through [`RowCodec::decode`], taking
    /// O(1) time in the opening row count and constant additional space.
    pub(super) fn decode(&self, wire: EncodedRowId<I>, domain: RowDomain<I>) -> Option<I>
    where
        I: Id,
    {
        self.codec.decode(wire, domain)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hashql_core::id::newtype;

    use super::Encoding;
    use crate::{
        identity::NodeRowId,
        serve::{
            codec::{EncodableId, RowCodec, RowDomain, WIRE_ROW_BOUND},
            tests::fixture::{NODES, TamperFixture, secret},
            world::{OpenOptions, WorldError},
        },
    };

    newtype! {
        /// Rows whose label stops codec derivation before lookup allocation.
        struct ValidationRow(u64)
    }

    impl EncodableId for ValidationRow {
        fn label() -> &'static [u8] {
            panic!("codec derivation reached");
        }
    }

    /// Empty and populated domains precompute the same mapping as the derived codec.
    #[test]
    fn open_valid_domains() {
        let fixture = TamperFixture::publish("encoding-valid-domains");
        let secret = secret();
        let options = OpenOptions {
            generation: fixture.generation(),
            secret: &secret,
        };
        let codec = RowCodec::<NodeRowId>::derive(secret.as_ref(), options.generation.id());

        for rows in [0, 1, NODES] {
            let domain = RowDomain::new(NodeRowId::new(rows));
            let encoding = Encoding::open(options, domain).expect("a small row domain should open");
            assert_eq!(
                encoding.lookup.len(),
                domain.size(),
                "every row should be precomputed"
            );
            for row in 0..rows {
                let row = NodeRowId::new(row);
                assert_eq!(
                    encoding.encode(row),
                    codec.encode(row),
                    "the lookup should match the codec"
                );
            }
            let next = domain.bound();
            assert_eq!(
                encoding.encode(next),
                codec.encode(next),
                "a later row should use the same mapping"
            );
        }
    }

    /// Oversized domains fail before codec derivation or lookup allocation.
    #[test]
    fn open_oversized_domain() {
        let fixture = TamperFixture::publish("encoding-oversized-domain");
        let domain = RowDomain::new(ValidationRow::new(WIRE_ROW_BOUND + 1));
        let error = Encoding::open(
            OpenOptions {
                generation: fixture.generation(),
                secret: &secret(),
            },
            domain,
        )
        .expect_err("an oversized row domain should fail validation");
        assert_matches!(
            error.current_context(),
            WorldError::TooManyRows { rows } if *rows == WIRE_ROW_BOUND + 1,
        );
    }

    /// The full wire domain passes validation, including its last row `u32::MAX`.
    ///
    /// The label stops derivation before allocating the full lookup table.
    #[test]
    #[cfg(target_pointer_width = "64")]
    #[should_panic(expected = "codec derivation reached")]
    fn open_full_wire_domain() {
        let fixture = TamperFixture::publish("encoding-full-wire-domain");
        let domain = RowDomain::new(ValidationRow::new(WIRE_ROW_BOUND));
        let _encoding = Encoding::open(
            OpenOptions {
                generation: fixture.generation(),
                secret: &secret(),
            },
            domain,
        )
        .expect("the full wire domain should pass validation");
    }
}
