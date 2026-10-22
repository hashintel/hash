//! Lowering from the syntax types to [`DefinitionParts`].
//!
//! Each part lowers to its value or to every issue found in it. Parts are lowered independently
//! and their issues combined, so one issue does not hide issues elsewhere in the definition.

mod pipelines;

use alloc::{
    boxed::Box,
    collections::{BTreeMap, BTreeSet},
    string::String,
    vec::Vec,
};
use core::{mem, str::FromStr};

use error_stack::{
    Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt as _,
};
use serde_saphyr::Spanned;
use type_system::ontology::VersionedUrl;
use url::Url;

use crate::{
    definition::DefinitionParts,
    issue::{DefinitionIssue, DefinitionPath, IssueKind, SourceLocation},
    name::{
        CheckpointName, ColumnName, ConnectorId, InvalidName, SourceName, UnitCode, UnitMapName,
        VariableName,
    },
    source::{Coverage, InvalidPrimaryKey, PrimaryKey, Source, SourceKind, SqlQuery},
    unit_map::UnitMap,
    variables::Variables,
    yaml::{
        interpolate::Interpolation,
        locations::Locations,
        syntax::{CoverageSyntax, Document, SourceSyntax, UnitMapSyntax, spanned_map::SpannedMap},
    },
};

/// The value an item lowers to, or every issue found in it.
type LoweredResult<T> = Result<T, Report<[DefinitionIssue]>>;

impl DefinitionIssue {
    /// Returns the issue for the entry at `path`, whose key at `location` repeats an earlier key
    /// once it is parsed.
    fn duplicate_key(path: DefinitionPath, location: Option<SourceLocation>, key: String) -> Self {
        Self::new(
            path,
            IssueKind::DuplicateKey {
                key: key.into_boxed_str(),
            },
        )
        .with_location(location)
    }
}

/// The variables and source locations used while lowering a document.
#[derive(Default)]
struct Lowering {
    interpolation: Interpolation,
    locations: Locations,
}

impl Lowering {
    fn record_location(&mut self, path: &DefinitionPath, location: Option<SourceLocation>) {
        self.locations.insert(path, location);
    }

    /// Returns `kind` at `path`, located where `path`, or the closest path it extends, is recorded.
    fn issue(&self, path: DefinitionPath, kind: IssueKind) -> DefinitionIssue {
        let location = self.locations.find(&path);
        DefinitionIssue::new(path, kind).with_location(location)
    }

    /// Returns a report of `kind` at `path`.
    fn report(&self, path: DefinitionPath, kind: IssueKind) -> Report<[DefinitionIssue]> {
        Report::new(self.issue(path, kind)).expand()
    }

    /// Replaces the placeholders in `text`, reporting each issue at `path`.
    fn resolve(&self, text: &str, path: &DefinitionPath) -> LoweredResult<String> {
        let (resolved, kinds) = self.interpolation.resolve(text);
        let mut issues = ReportSink::new();
        for kind in kinds {
            issues.capture(self.issue(path.clone(), kind));
        }
        issues.finish_ok(resolved)
    }

    /// Records the location of `value` at `path` and returns its text with placeholders
    /// replaced.
    fn text(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> LoweredResult<String> {
        self.record_location(path, SourceLocation::from_spanned(value));
        self.resolve(&value.value, path)
    }

    fn parse_name<T: FromStr<Err = InvalidName>>(
        &self,
        text: String,
        path: &DefinitionPath,
    ) -> LoweredResult<T> {
        T::from_str(&text).map_err(|reason| {
            self.report(
                path.clone(),
                IssueKind::InvalidName {
                    value: text.into_boxed_str(),
                    reason,
                },
            )
        })
    }

    /// Records the variables that placeholders and SQL parameters refer to, reporting names that
    /// are not valid.
    fn variables(&mut self, vars: &SpannedMap<Spanned<String>>) -> LoweredResult<()> {
        let vars_path = DefinitionPath::default().field("vars");
        let mut issues = ReportSink::new();

        for (name, value) in vars.iter() {
            let path = vars_path.clone().key(&name.value);
            self.record_location(&path, SourceLocation::from_spanned(name));
            match self.parse_name::<VariableName>(name.value.clone(), &path) {
                Ok(name) => self.interpolation.insert(name, value.value.as_str().into()),
                Err(report) => {
                    self.interpolation
                        .insert_invalid(name.value.as_str().into(), value.value.as_str().into());
                    issues.append(report);
                }
            }
        }

        issues.finish()
    }

    fn name<T: FromStr<Err = InvalidName>>(
        &mut self,
        value: &Spanned<String>,
        path: &DefinitionPath,
    ) -> LoweredResult<T> {
        let text = self.text(value, path)?;
        self.parse_name(text, path)
    }

    /// Returns the column name in `text`, which has no location of its own. Issues use the
    /// location of `path`.
    fn column(&self, text: &str, path: &DefinitionPath) -> LoweredResult<ColumnName> {
        let text = self.resolve(text, path)?;
        self.parse_name(text, path)
    }

    fn parse_url(&self, text: String, path: &DefinitionPath) -> LoweredResult<VersionedUrl> {
        VersionedUrl::from_str(&text).map_err(|reason| {
            self.report(
                path.clone(),
                IssueKind::InvalidTypeUrl {
                    value: text.into_boxed_str(),
                    reason,
                },
            )
        })
    }

    fn url(
        &mut self,
        value: &Spanned<String>,
        path: &DefinitionPath,
    ) -> LoweredResult<VersionedUrl> {
        let text = self.text(value, path)?;
        self.parse_url(text, path)
    }

    /// Records the location of `value` at `path` and returns its text without replacing
    /// placeholders.
    fn query(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> LoweredResult<SqlQuery> {
        self.record_location(path, SourceLocation::from_spanned(value));
        Ok(SqlQuery::try_from(value.value.clone())
            .change_context_lazy(|| self.issue(path.clone(), IssueKind::EmptySql))?)
    }

    /// Returns the path of a mapping entry, and its key's text with placeholders replaced.
    ///
    /// If the placeholders cannot be replaced, the path uses the key as written.
    fn key(
        &mut self,
        key: &Spanned<String>,
        map_path: &DefinitionPath,
    ) -> (DefinitionPath, LoweredResult<String>) {
        let written_path = map_path.clone().key(&key.value);
        self.record_location(&written_path, SourceLocation::from_spanned(key));
        match self.resolve(&key.value, &written_path) {
            Ok(text) => {
                let path = map_path.clone().key(&text);
                self.record_location(&path, SourceLocation::from_spanned(key));
                (path, Ok(text))
            }
            Err(report) => (written_path, Err(report)),
        }
    }

    /// Lowers a mapping, reporting keys that repeat an earlier key once they are parsed.
    ///
    /// Every value is lowered, also when its key has an issue.
    fn entries<K, S, V>(
        &mut self,
        map: &SpannedMap<S>,
        map_path: &DefinitionPath,
        mut parse_key: impl FnMut(&mut Self, String, &DefinitionPath) -> LoweredResult<K>,
        mut lower_value: impl FnMut(&mut Self, &S, &DefinitionPath) -> LoweredResult<V>,
    ) -> LoweredResult<BTreeMap<K, V>>
    where
        K: Ord + Clone,
    {
        let mut lowered = BTreeMap::new();
        let mut keys = BTreeSet::new();
        let mut issues = ReportSink::new();

        for (key, value) in map.iter() {
            let (path, text) = self.key(key, map_path);
            let parsed =
                match text.and_then(|text| Ok((parse_key(self, text.clone(), &path)?, text))) {
                    Ok(parsed) => Some(parsed),
                    Err(report) => {
                        issues.append(report);
                        None
                    }
                };
            let value = match lower_value(self, value, &path) {
                Ok(value) => Some(value),
                Err(report) => {
                    issues.append(report);
                    None
                }
            };

            let Some((parsed, text)) = parsed else {
                continue;
            };
            if keys.insert(parsed.clone()) {
                if let Some(value) = value {
                    lowered.insert(parsed, value);
                }
            } else {
                issues.capture(DefinitionIssue::duplicate_key(
                    path,
                    SourceLocation::from_spanned(key),
                    text,
                ));
            }
        }

        issues.finish_ok(lowered)
    }

    /// Lowers a mapping whose keys are names.
    fn map<K, S, V>(
        &mut self,
        map: &SpannedMap<S>,
        map_path: &DefinitionPath,
        lower_value: impl FnMut(&mut Self, &S, &DefinitionPath) -> LoweredResult<V>,
    ) -> LoweredResult<BTreeMap<K, V>>
    where
        K: Ord + Clone + FromStr<Err = InvalidName>,
    {
        self.entries(
            map,
            map_path,
            |lowering, text, path| lowering.parse_name(text, path),
            lower_value,
        )
    }

    fn primary_key(
        &mut self,
        value: &Spanned<Vec<Spanned<String>>>,
        path: &DefinitionPath,
    ) -> LoweredResult<PrimaryKey> {
        self.record_location(path, SourceLocation::from_spanned(value));
        let mut seen = BTreeSet::new();
        let columns: Vec<ColumnName> = value
            .value
            .iter()
            .enumerate()
            .map(|(position, column)| {
                let column = self.name::<ColumnName>(column, &path.clone().index(position))?;
                if !seen.insert(column.clone()) {
                    return Err(self.report(
                        path.clone(),
                        IssueKind::InvalidPrimaryKey {
                            reason: InvalidPrimaryKey::DuplicateColumn { column },
                        },
                    ));
                }
                Ok(column)
            })
            .try_collect_reports()?;
        PrimaryKey::new(columns)
            .map_err(|reason| self.report(path.clone(), IssueKind::InvalidPrimaryKey { reason }))
    }
}

impl UnitMapSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> LoweredResult<UnitMap> {
        let units = lowering.map::<UnitCode, _, _>(
            &self.units,
            &path.clone().field("units"),
            Lowering::url,
        );
        let fallback = self
            .fallback
            .as_ref()
            .map(|fallback| lowering.url(fallback, &path.clone().field("fallback")))
            .transpose();

        let (units, fallback) = (units, fallback).try_collect()?;
        Ok(UnitMap::new(units, fallback)
            .change_context_lazy(|| lowering.issue(path.clone(), IssueKind::EmptyUnitMap))?)
    }
}

impl From<CoverageSyntax> for Coverage {
    fn from(coverage: CoverageSyntax) -> Self {
        match coverage {
            CoverageSyntax::Partial => Self::Partial,
            CoverageSyntax::Complete => Self::Complete,
            CoverageSyntax::CompleteOrEmpty => Self::CompleteOrEmpty,
        }
    }
}

impl SourceSyntax {
    const KINDS: &'static [&'static str] =
        &["sql", "checkpoint", "local", "postgres", "redshift", "rest"];

    fn check_kind(&self, lowering: &mut Lowering, path: &DefinitionPath) -> LoweredResult<()> {
        let found: Box<[_]> = Self::KINDS
            .iter()
            .copied()
            .zip([
                self.sql.is_some(),
                self.checkpoint.is_some(),
                self.local.is_some(),
                self.postgres.is_some(),
                self.redshift.is_some(),
                self.rest.is_some(),
            ])
            .filter_map(|(kind, present)| present.then_some(kind))
            .collect();
        if found.len() != 1 {
            let reason = if found.is_empty() {
                IssueKind::MissingKind {
                    expected: Self::KINDS,
                }
            } else {
                IssueKind::ConflictingKinds { found }
            };
            let kind: LoweredResult<()> = Err(lowering.report(path.clone(), reason));
            let query = self
                .sql
                .as_ref()
                .map(|sql| lowering.query(sql, &path.clone().field("sql")))
                .transpose();
            let checkpoint = self
                .checkpoint
                .as_ref()
                .map(|checkpoint| {
                    lowering.name::<CheckpointName>(checkpoint, &path.clone().field("checkpoint"))
                })
                .transpose();
            let primary_key = self
                .primary_key
                .as_ref()
                .map(|key| lowering.primary_key(key, &path.clone().field("primaryKey")))
                .transpose();
            (kind, query, checkpoint, primary_key).try_collect()?;
        }
        Ok(())
    }

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> LoweredResult<Source> {
        self.check_kind(lowering, path)?;
        let kind = if let Some(checkpoint) = &self.checkpoint {
            let key = self.primary_key.as_ref().map_or(Ok(()), |key| {
                let path = path.clone().field("primaryKey");
                lowering.record_location(&path, SourceLocation::from_spanned(key));
                Err(lowering.report(
                    path,
                    IssueKind::UnexpectedField {
                        field: "primaryKey",
                    },
                ))
            });
            let checkpoint = lowering.name(checkpoint, &path.clone().field("checkpoint"));
            let ((), checkpoint) = (key, checkpoint).try_collect()?;
            SourceKind::Checkpoint { checkpoint }
        } else {
            let primary_key = if let Some(key) = &self.primary_key {
                lowering.primary_key(key, &path.clone().field("primaryKey"))
            } else {
                Err(lowering.report(
                    path.clone(),
                    IssueKind::MissingField {
                        field: "primaryKey",
                    },
                ))
            };
            if let Some(sql) = &self.sql {
                let query = lowering.query(sql, &path.clone().field("sql"));
                let (query, primary_key) = (query, primary_key).try_collect()?;
                SourceKind::Sql { query, primary_key }
            } else if let Some(local) = &self.local {
                let key = lowering.text(local, &path.clone().field("local"));
                let (key, primary_key) = (key, primary_key).try_collect()?;
                SourceKind::Local {
                    key: key.into_boxed_str(),
                    primary_key,
                }
            } else if let Some(source) = self.postgres.as_ref().or(self.redshift.as_ref()) {
                let path = path.clone().field(if self.postgres.is_some() {
                    "postgres"
                } else {
                    "redshift"
                });
                let connection_path = path.clone().field("connection");
                let connection = lowering.text(&source.value.connection, &connection_path)?;
                let connection = Url::parse(&connection).map_err(|_error| {
                    lowering.report(
                        connection_path,
                        IssueKind::InvalidSource {
                            reason: "connection must be a valid PostgreSQL URI",
                        },
                    )
                })?;
                let schema = lowering.text(&source.value.schema, &path.clone().field("schema"))?;
                let table = lowering.text(&source.value.table, &path.field("table"))?;
                SourceKind::Postgres {
                    source: crate::PostgresSource {
                        connection,
                        schema: schema.into_boxed_str(),
                        table: table.into_boxed_str(),
                        credentials: source.value.credentials,
                    },
                    primary_key: primary_key?,
                }
            } else if let Some(endpoint) = &self.rest {
                let mut endpoint = endpoint.value.clone();
                endpoint.url = lowering.resolve(&endpoint.url, path)?;
                for value in endpoint.params.values_mut() {
                    *value = lowering.resolve(value, path)?;
                }
                SourceKind::Rest {
                    endpoint,
                    primary_key: primary_key?,
                }
            } else {
                return Err(lowering.report(
                    path.clone(),
                    IssueKind::MissingKind {
                        expected: Self::KINDS,
                    },
                ));
            }
        };
        Ok(Source {
            kind,
            coverage: self.coverage.map_or(Coverage::Complete, Coverage::from),
        })
    }
}

impl Document {
    /// Lowers the document to the parts of a definition, and records where each part is.
    ///
    /// # Errors
    ///
    /// Returns every issue found while lowering, each with its source location where one is known.
    /// [`Definition::new`](crate::Definition::new) checks the parts against each other
    /// afterwards.
    pub(in crate::yaml) fn lower(&self) -> LoweredResult<(DefinitionParts, Locations)> {
        let mut lowering = Lowering::default();
        let declared = lowering.variables(&self.vars);

        let connector = lowering.name::<ConnectorId>(
            &self.connector,
            &DefinitionPath::default().field("connector"),
        );
        let unit_maps = lowering.map::<UnitMapName, _, _>(
            &self.unit_maps,
            &DefinitionPath::default().field("unitMaps"),
            |lowering, unit_map, path| unit_map.lower(lowering, path),
        );
        let sources = lowering.map::<SourceName, _, _>(
            &self.sources,
            &DefinitionPath::default().field("sources"),
            |lowering, source, path| source.lower(lowering, path),
        );
        let entity_pipelines = self.pipelines.lower_entities(&mut lowering);
        let link_pipelines = self.pipelines.lower_links(&mut lowering);
        let variables = Variables::try_from(mem::take(&mut lowering.interpolation).into_values())
            .map_err(|reason| {
                lowering.report(
                    DefinitionPath::default()
                        .field("vars")
                        .key(&reason.variable),
                    IssueKind::ConflictingVariables { reason },
                )
            });

        let ((), variables, connector, unit_maps, sources, entity_pipelines, link_pipelines) = (
            declared,
            variables,
            connector,
            unit_maps,
            sources,
            entity_pipelines,
            link_pipelines,
        )
            .try_collect()?;

        Ok((
            DefinitionParts {
                connector,
                variables,
                sources,
                unit_maps,
                entity_pipelines,
                link_pipelines,
            },
            lowering.locations,
        ))
    }
}
