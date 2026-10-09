//! Lowering from the syntax types to [`DefinitionParts`].
//!
//! Each part lowers to its value or to every issue found in it. Parts are lowered independently
//! and their issues combined, so one issue does not hide issues elsewhere in the definition.

mod pipelines;

use alloc::{
    collections::{BTreeMap, BTreeSet},
    string::String,
    vec::Vec,
};
use core::str::FromStr;

use error_stack::{
    Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt as _,
};
use serde_saphyr::Spanned;
use type_system::ontology::VersionedUrl;

use crate::{
    definition::DefinitionParts,
    issue::{DefinitionIssue, DefinitionPath, IssueKind, SourceLocation},
    name::{ColumnName, ConnectorId, InvalidName, SourceName, UnitCode, UnitMapName, VariableName},
    source::{Coverage, PrimaryKey, Source, SourceKind, SqlQuery},
    unit_map::UnitMap,
    yaml::{
        interpolate::Variables,
        locations::Locations,
        syntax::{CoverageSyntax, Document, SourceSyntax, UnitMapSyntax, spanned_map::SpannedMap},
    },
};

/// The value an item lowers to, or every issue found in it.
type Lowered<T> = Result<T, Report<[DefinitionIssue]>>;

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
    variables: Variables,
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
    fn resolve(&self, text: &str, path: &DefinitionPath) -> Lowered<String> {
        let (resolved, kinds) = self.variables.resolve(text);
        let mut issues = ReportSink::new();
        for kind in kinds {
            issues.capture(self.issue(path.clone(), kind));
        }
        issues.finish_ok(resolved)
    }

    /// Records the location of `value` at `path` and returns its text with placeholders
    /// replaced.
    fn text(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Lowered<String> {
        self.record_location(path, SourceLocation::from_spanned(value));
        self.resolve(&value.value, path)
    }

    fn parse_name<T: FromStr<Err = InvalidName>>(
        &self,
        text: String,
        path: &DefinitionPath,
    ) -> Lowered<T> {
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

    /// Records the variables that placeholders refer to, reporting names that are not valid.
    fn variables(&mut self, vars: &SpannedMap<Spanned<String>>) -> Lowered<()> {
        let vars_path = DefinitionPath::default().field("vars");
        let mut issues = ReportSink::new();

        for (name, value) in vars.iter() {
            let path = vars_path.clone().key(&name.value);
            self.record_location(&path, SourceLocation::from_spanned(name));
            match self.parse_name::<VariableName>(name.value.clone(), &path) {
                Ok(name) => self.variables.insert(name, value.value.as_str().into()),
                Err(report) => {
                    self.variables
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
    ) -> Lowered<T> {
        let text = self.text(value, path)?;
        self.parse_name(text, path)
    }

    /// Returns the column name in `text`, which has no location of its own. Issues use the
    /// location of `path`.
    fn column(&self, text: &str, path: &DefinitionPath) -> Lowered<ColumnName> {
        let text = self.resolve(text, path)?;
        self.parse_name(text, path)
    }

    fn parse_url(&self, text: String, path: &DefinitionPath) -> Lowered<VersionedUrl> {
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

    fn url(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Lowered<VersionedUrl> {
        let text = self.text(value, path)?;
        self.parse_url(text, path)
    }

    fn query(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Lowered<SqlQuery> {
        let text = self.text(value, path)?;
        Ok(SqlQuery::try_from(text)
            .change_context_lazy(|| self.issue(path.clone(), IssueKind::EmptySql))?)
    }

    /// Returns the path of a mapping entry, and its key's text with placeholders replaced.
    ///
    /// If the placeholders cannot be replaced, the path uses the key as written.
    fn key(
        &mut self,
        key: &Spanned<String>,
        map_path: &DefinitionPath,
    ) -> (DefinitionPath, Lowered<String>) {
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
        mut parse_key: impl FnMut(&mut Self, String, &DefinitionPath) -> Lowered<K>,
        mut lower_value: impl FnMut(&mut Self, &S, &DefinitionPath) -> Lowered<V>,
    ) -> Lowered<BTreeMap<K, V>>
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
        lower_value: impl FnMut(&mut Self, &S, &DefinitionPath) -> Lowered<V>,
    ) -> Lowered<BTreeMap<K, V>>
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
    ) -> Lowered<PrimaryKey> {
        self.record_location(path, SourceLocation::from_spanned(value));
        let columns: Vec<ColumnName> = value
            .value
            .iter()
            .enumerate()
            .map(|(position, column)| {
                self.name::<ColumnName>(column, &path.clone().index(position))
            })
            .try_collect_reports()?;
        PrimaryKey::new(columns)
            .map_err(|reason| self.report(path.clone(), IssueKind::InvalidPrimaryKey { reason }))
    }
}

impl UnitMapSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<UnitMap> {
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
    const KINDS: &'static [&'static str] = &["sql", "checkpoint"];

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<Source> {
        let coverage = self.coverage.map_or(Coverage::Complete, Coverage::from);

        let kind = match (&self.sql, &self.checkpoint) {
            (Some(sql), None) => {
                let query = lowering.query(sql, &path.clone().field("sql"));
                let primary_key = if let Some(primary_key) = &self.primary_key {
                    lowering.primary_key(primary_key, &path.clone().field("primaryKey"))
                } else {
                    Err(lowering.report(
                        path.clone(),
                        IssueKind::MissingField {
                            field: "primaryKey",
                        },
                    ))
                };
                let (query, primary_key) = (query, primary_key).try_collect()?;
                SourceKind::Sql { query, primary_key }
            }
            (None, Some(checkpoint)) => {
                let primary_key = self.primary_key.as_ref().map_or(Ok(()), |primary_key| {
                    let primary_key_path = path.clone().field("primaryKey");
                    lowering.record_location(
                        &primary_key_path,
                        SourceLocation::from_spanned(primary_key),
                    );
                    Err(lowering.report(
                        primary_key_path,
                        IssueKind::UnexpectedField {
                            field: "primaryKey",
                        },
                    ))
                });
                let checkpoint = lowering.name(checkpoint, &path.clone().field("checkpoint"));
                let ((), checkpoint) = (primary_key, checkpoint).try_collect()?;
                SourceKind::Checkpoint { checkpoint }
            }
            (None, None) => {
                return Err(lowering.report(
                    path.clone(),
                    IssueKind::MissingKind {
                        expected: Self::KINDS,
                    },
                ));
            }
            (Some(_), Some(_)) => {
                return Err(lowering.report(
                    path.clone(),
                    IssueKind::ConflictingKinds {
                        found: Self::KINDS.into(),
                    },
                ));
            }
        };

        Ok(Source { kind, coverage })
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
    pub(in crate::yaml) fn lower(&self) -> Lowered<(DefinitionParts, Locations)> {
        let mut lowering = Lowering::default();
        let variables = lowering.variables(&self.vars);

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

        let ((), connector, unit_maps, sources, entity_pipelines, link_pipelines) = (
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
                sources,
                unit_maps,
                entity_pipelines,
                link_pipelines,
            },
            lowering.locations,
        ))
    }
}
