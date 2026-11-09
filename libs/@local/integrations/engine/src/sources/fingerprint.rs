use core::fmt::Write as _;

use hash_crypto::digest::Sha256;
use hash_integrations_definition::{
    Coverage, Pagination, PostgresSource, PrimaryKey, RestAuth, RestSource, SecretReference,
    Source, SourceKind,
};

/// Names the encoding below. Change it whenever the encoding changes, so that no capture is
/// reused under a fingerprint computed another way.
const ENCODING: &str = "hash-integrations-engine/source-fingerprint/v1";

/// Identifies the definition of `source` as 64 lowercase hexadecimal digits.
///
/// This is the SHA-256 digest of every field of the source. Each value is written with its length
/// and each variant by name, so different sources never encode to the same input. Every struct
/// and enum is destructured exhaustively, so a new field does not compile until it is encoded
/// here.
///
/// Captures outlive a deploy, so the encoding is spelled out rather than derived: the output must
/// not change with the compiler or a dependency.
pub(super) fn fingerprint(source: &Source) -> String {
    let mut encoder = Encoder(Sha256::new());
    encoder.text(ENCODING);
    encoder.source(source);
    let mut hex = String::with_capacity(64);
    for byte in encoder.0.finalize().to_bytes() {
        write!(hex, "{byte:02x}").expect("writing to a `String` should not fail");
    }
    hex
}

struct Encoder(Sha256);

impl Encoder {
    #[expect(
        clippy::big_endian_bytes,
        reason = "the encoding fixes the byte order so the fingerprint is the same on every \
                  machine"
    )]
    fn number(&mut self, value: u64) {
        self.0.update(&value.to_be_bytes());
    }

    fn length(&mut self, length: usize) {
        self.number(u64::try_from(length).expect("a length should fit in 64 bits"));
    }

    fn text(&mut self, value: &str) {
        self.length(value.len());
        self.0.update(value.as_bytes());
    }

    fn optional<T>(&mut self, value: Option<T>, encode: impl FnOnce(&mut Self, T)) {
        match value {
            None => self.text("none"),
            Some(value) => {
                self.text("some");
                encode(self, value);
            }
        }
    }

    fn source(&mut self, source: &Source) {
        let Source { kind, coverage } = source;
        self.kind(kind);
        self.text(match coverage {
            Coverage::Partial => "partial",
            Coverage::Complete => "complete",
            Coverage::CompleteOrEmpty => "complete-or-empty",
        });
    }

    fn kind(&mut self, kind: &SourceKind) {
        match kind {
            SourceKind::Sql { query, primary_key } => {
                self.text("sql");
                self.text(query.as_ref());
                self.primary_key(primary_key);
            }
            SourceKind::Local { key, primary_key } => {
                self.text("local");
                self.text(key);
                self.primary_key(primary_key);
            }
            SourceKind::Postgres {
                source,
                primary_key,
            } => {
                self.text("postgres");
                self.postgres(source);
                self.primary_key(primary_key);
            }
            SourceKind::Rest {
                endpoint,
                primary_key,
            } => {
                self.text("rest");
                self.rest(endpoint);
                self.primary_key(primary_key);
            }
            SourceKind::Checkpoint { checkpoint } => {
                self.text("checkpoint");
                self.text(checkpoint.as_ref());
            }
        }
    }

    fn primary_key(&mut self, primary_key: &PrimaryKey) {
        let columns = primary_key.columns();
        self.length(columns.len());
        for column in columns {
            self.text(column.as_ref());
        }
    }

    fn secret(&mut self, reference: SecretReference) {
        let SecretReference { secret_entity_uuid } = reference;
        self.0.update(secret_entity_uuid.as_bytes());
    }

    fn postgres(&mut self, source: &PostgresSource) {
        let PostgresSource {
            connection,
            schema,
            table,
            credentials,
        } = source;
        self.text(connection.as_str());
        self.text(schema);
        self.text(table);
        self.secret(*credentials);
    }

    fn rest(&mut self, endpoint: &RestSource) {
        let RestSource {
            url,
            params,
            auth,
            results_field,
            pagination,
            page_size,
            max_pages,
            rate_limit_ms,
        } = endpoint;
        self.text(url);
        self.length(params.len());
        for (name, value) in params {
            self.text(name);
            self.text(value);
        }
        self.optional(auth.as_ref(), Self::auth);
        self.optional(results_field.as_deref(), Self::text);
        self.optional(pagination.as_ref(), Self::pagination);
        self.number(page_size.get());
        self.optional(*max_pages, |encoder, pages| encoder.number(pages.get()));
        self.number(*rate_limit_ms);
    }

    fn auth(&mut self, auth: &RestAuth) {
        match auth {
            RestAuth::Header {
                name,
                secret_entity_uuid,
            } => {
                self.text("header");
                self.text(name);
                self.secret(SecretReference {
                    secret_entity_uuid: *secret_entity_uuid,
                });
            }
            RestAuth::Bearer { secret_entity_uuid } => {
                self.text("bearer");
                self.secret(SecretReference {
                    secret_entity_uuid: *secret_entity_uuid,
                });
            }
        }
    }

    fn pagination(&mut self, pagination: &Pagination) {
        match pagination {
            Pagination::NextLink { field } => {
                self.text("next-link");
                self.text(field);
            }
            Pagination::Offset => self.text("offset"),
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::collections::{BTreeMap, BTreeSet};
    use core::{num::NonZeroU64, str::FromStr as _};

    use hash_integrations_definition::{
        CheckpointName, ColumnName, Coverage, Pagination, PostgresSource, PrimaryKey, RestAuth,
        RestSource, SecretReference, Source, SourceKind, SqlQuery,
    };
    use rstest::rstest;
    use url::Url;
    use uuid::Uuid;

    use super::fingerprint;

    const SECRET: Uuid = Uuid::from_u128(0x4F1C_2B8E_6A3D_4E5F_9B7A_1C2D_3E4F_5A6B);

    fn primary_key(columns: &[&str]) -> PrimaryKey {
        PrimaryKey::new(
            columns
                .iter()
                .map(|column| ColumnName::from_str(column).expect("should be a valid column name")),
        )
        .expect("should be a valid primary key")
    }

    fn query(text: &str) -> SqlQuery {
        SqlQuery::try_from(text.to_owned()).expect("should be a query")
    }

    fn checkpoint_name(name: &str) -> CheckpointName {
        CheckpointName::from_str(name).expect("should be a valid checkpoint name")
    }

    fn sql() -> Source {
        Source {
            kind: SourceKind::Sql {
                query: query("SELECT 1 AS id"),
                primary_key: primary_key(&["id"]),
            },
            coverage: Coverage::Complete,
        }
    }

    fn local() -> Source {
        Source {
            kind: SourceKind::Local {
                key: "items.parquet".into(),
                primary_key: primary_key(&["id"]),
            },
            coverage: Coverage::Complete,
        }
    }

    fn postgres() -> Source {
        Source {
            kind: SourceKind::Postgres {
                source: PostgresSource {
                    connection: Url::parse("postgresql://database.example/demo")
                        .expect("should be a valid URL"),
                    schema: "public".into(),
                    table: "items".into(),
                    credentials: SecretReference {
                        secret_entity_uuid: SECRET,
                    },
                },
                primary_key: primary_key(&["id"]),
            },
            coverage: Coverage::Complete,
        }
    }

    fn rest() -> Source {
        Source {
            kind: SourceKind::Rest {
                endpoint: RestSource {
                    url: "https://api.example/items".to_owned(),
                    params: BTreeMap::new(),
                    auth: Some(RestAuth::Bearer {
                        secret_entity_uuid: SECRET,
                    }),
                    results_field: None,
                    pagination: None,
                    page_size: NonZeroU64::new(100).expect("should be nonzero"),
                    max_pages: None,
                    rate_limit_ms: 0,
                },
                primary_key: primary_key(&["id"]),
            },
            coverage: Coverage::Complete,
        }
    }

    fn checkpoint() -> Source {
        Source {
            kind: SourceKind::Checkpoint {
                checkpoint: checkpoint_name("aviation/airfields"),
            },
            coverage: Coverage::Complete,
        }
    }

    fn key(source: &mut Source) -> &mut PrimaryKey {
        match &mut source.kind {
            SourceKind::Sql { primary_key, .. }
            | SourceKind::Local { primary_key, .. }
            | SourceKind::Postgres { primary_key, .. }
            | SourceKind::Rest { primary_key, .. } => primary_key,
            SourceKind::Checkpoint { .. } => panic!("a checkpoint source has no primary key"),
        }
    }

    fn table(source: &mut Source) -> &mut PostgresSource {
        let SourceKind::Postgres { source, .. } = &mut source.kind else {
            panic!("the base source should read from PostgreSQL");
        };
        source
    }

    fn endpoint(source: &mut Source) -> &mut RestSource {
        let SourceKind::Rest { endpoint, .. } = &mut source.kind else {
            panic!("the base source should read from REST");
        };
        endpoint
    }

    /// Captures published under a fingerprint are found again only while the fingerprint stays
    /// the same, so these values change only together with `ENCODING`.
    #[rstest]
    #[case::sql(
        sql,
        "691415c72923dc450765fe2b109d73d6fea654e04ecd2d60627789013cbb6cdb"
    )]
    #[case::local(
        local,
        "d23eda7a98a60994560ea87536431f1139f87262ac4e97a0ab71751d6786d73d"
    )]
    #[case::postgres(
        postgres,
        "f265682f8331b61b89f55be57cec42af415a4cb3abf31f02fc09795be50669b2"
    )]
    #[case::rest(
        rest,
        "b7d2f50cdfd5968c5366ecf01ae6443374e63308affb3734aaf59e77d373f132"
    )]
    #[case::checkpoint(
        checkpoint,
        "dbad5c18ba9c44edf9633ced37d2ec320dfd4322eecdd4fad4b8cf680f196068"
    )]
    fn fingerprint_known_value(#[case] source: fn() -> Source, #[case] expected: &str) {
        assert_eq!(
            fingerprint(&source()),
            expected,
            "should not change without a new encoding name"
        );
    }

    #[rstest]
    #[case::sql_query(sql, |source: &mut Source| {
        let SourceKind::Sql { query: text, .. } = &mut source.kind else {
            panic!("the base source should be SQL");
        };
        *text = query("SELECT 2 AS id");
    })]
    #[case::sql_primary_key(sql, |source: &mut Source| *key(source) = primary_key(&["key"]))]
    #[case::local_key(local, |source: &mut Source| {
        let SourceKind::Local { key: file, .. } = &mut source.kind else {
            panic!("the base source should be local");
        };
        *file = "other.parquet".into();
    })]
    #[case::local_primary_key(local, |source: &mut Source| *key(source) = primary_key(&["key"]))]
    #[case::postgres_connection(postgres, |source: &mut Source| {
        table(source).connection =
            Url::parse("postgresql://database.example/other").expect("should be a valid URL");
    })]
    #[case::postgres_schema(postgres, |source: &mut Source| table(source).schema = "audit".into())]
    #[case::postgres_table(postgres, |source: &mut Source| table(source).table = "other".into())]
    #[case::postgres_credentials(postgres, |source: &mut Source| {
        table(source).credentials = SecretReference {
            secret_entity_uuid: Uuid::from_u128(1),
        };
    })]
    #[case::postgres_primary_key(postgres, |source: &mut Source| {
        *key(source) = primary_key(&["id", "version"]);
    })]
    #[case::rest_url(rest, |source: &mut Source| {
        endpoint(source).url = "https://api.example/other".to_owned();
    })]
    #[case::rest_params(rest, |source: &mut Source| {
        endpoint(source).params.insert("page".to_owned(), "1".to_owned());
    })]
    #[case::rest_no_auth(rest, |source: &mut Source| endpoint(source).auth = None)]
    #[case::rest_header_auth(rest, |source: &mut Source| {
        endpoint(source).auth = Some(RestAuth::Header {
            name: "x-api-key".to_owned(),
            secret_entity_uuid: SECRET,
        });
    })]
    #[case::rest_secret(rest, |source: &mut Source| {
        endpoint(source).auth = Some(RestAuth::Bearer {
            secret_entity_uuid: Uuid::from_u128(1),
        });
    })]
    #[case::rest_results_field(rest, |source: &mut Source| {
        endpoint(source).results_field = Some("items".to_owned());
    })]
    #[case::rest_offset(rest, |source: &mut Source| {
        endpoint(source).pagination = Some(Pagination::Offset);
    })]
    #[case::rest_next_link(rest, |source: &mut Source| {
        endpoint(source).pagination = Some(Pagination::NextLink {
            field: "next".to_owned(),
        });
    })]
    #[case::rest_page_size(rest, |source: &mut Source| {
        endpoint(source).page_size = NonZeroU64::new(50).expect("should be nonzero");
    })]
    #[case::rest_max_pages(rest, |source: &mut Source| {
        endpoint(source).max_pages = NonZeroU64::new(3);
    })]
    #[case::rest_rate_limit(rest, |source: &mut Source| endpoint(source).rate_limit_ms = 10)]
    #[case::rest_primary_key(rest, |source: &mut Source| *key(source) = primary_key(&["key"]))]
    #[case::rest_coverage(rest, |source: &mut Source| source.coverage = Coverage::Partial)]
    #[case::checkpoint_name(checkpoint, |source: &mut Source| {
        source.kind = SourceKind::Checkpoint {
            checkpoint: checkpoint_name("aviation/hangars"),
        };
    })]
    #[case::checkpoint_coverage(checkpoint, |source: &mut Source| {
        source.coverage = Coverage::CompleteOrEmpty;
    })]
    fn fingerprint_changed_source(#[case] base: fn() -> Source, #[case] change: fn(&mut Source)) {
        let mut changed = base();
        change(&mut changed);
        assert_ne!(
            fingerprint(&changed),
            fingerprint(&base()),
            "a changed source should have another fingerprint"
        );
    }

    /// Sources of different kinds never share a fingerprint, even when they hold the same text.
    #[test]
    fn fingerprint_distinct_kinds() {
        let items = || primary_key(&["id"]);
        let sources = [
            SourceKind::Sql {
                query: query("items"),
                primary_key: items(),
            },
            SourceKind::Local {
                key: "items".into(),
                primary_key: items(),
            },
            SourceKind::Checkpoint {
                checkpoint: checkpoint_name("items"),
            },
        ]
        .into_iter()
        .map(|kind| Source {
            kind,
            coverage: Coverage::Complete,
        })
        .chain([sql(), local(), postgres(), rest(), checkpoint()]);
        let count = sources.clone().count();
        let fingerprints: BTreeSet<_> = sources.map(|source| fingerprint(&source)).collect();
        assert_eq!(
            fingerprints.len(),
            count,
            "every source should have a fingerprint of its own"
        );
    }
}
