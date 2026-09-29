//! Lowering from the syntax types to [`DefinitionParts`].
//!
//! Every item is lowered before the results are combined, so one invalid field does not hide
//! issues in later ones.

mod pipelines;

use alloc::{collections::BTreeMap, string::String, vec::Vec};
use core::{error::Error, str::FromStr};

use error_stack::Report;
use serde_saphyr::Spanned;
use type_system::ontology::VersionedUrl;

use super::{CoverageSyntax, Document, SourceSyntax, UnitMapSyntax, spanned_map::SpannedMap};
use crate::{
    definition::DefinitionParts,
    issue::{DefinitionIssue, DefinitionPath, IssueKind, SourceLocation},
    name::{ColumnName, ConnectorId, InvalidName, SourceName, UnitCode, UnitMapName},
    source::{Coverage, PrimaryKey, Source, SourceKind, SqlQuery},
    unit_map::UnitMap,
    yaml::{interpolate::Variables, locations::Locations},
};

/// Returns every item, or `None` if any item is `None`.
///
/// The caller lowers every item before calling this, so a failed item does not stop later
/// items from reporting their issues.
fn all<T>(items: Vec<Option<T>>) -> Option<Vec<T>> {
    items.into_iter().collect()
}

fn location<T>(value: &Spanned<T>) -> Option<SourceLocation> {
    SourceLocation::from_yaml(&value.referenced)
}

/// Collects the issues and source locations found while lowering a document.
struct Lowering {
    variables: Variables,
    issues: Vec<Report<DefinitionIssue>>,
    locations: Locations,
}

impl Lowering {
    fn new(vars: &SpannedMap<Spanned<String>>) -> Self {
        let mut variables = Variables::default();
        for (name, value) in vars.iter() {
            variables.insert(name.value.clone(), value.value.clone());
        }

        Self {
            variables,
            issues: Vec::new(),
            locations: Locations::default(),
        }
    }

    fn locate(&mut self, path: &DefinitionPath, location: Option<SourceLocation>) {
        self.locations.insert(path.clone(), location);
    }

    fn issue(&self, path: DefinitionPath, kind: IssueKind) -> DefinitionIssue {
        DefinitionIssue {
            location: self.locations.find(&path),
            path,
            kind,
        }
    }

    /// Reports `kind` at `path`, located where `path` or its closest recorded parent is.
    fn report(&mut self, path: DefinitionPath, kind: IssueKind) {
        let issue = self.issue(path, kind);
        self.issues.push(Report::new(issue));
    }

    /// Reports that the key at `location` repeats a key of the map at `path`.
    fn report_duplicate(
        &mut self,
        path: DefinitionPath,
        location: Option<SourceLocation>,
        key: String,
    ) {
        self.issues.push(Report::new(DefinitionIssue {
            path,
            kind: IssueKind::DuplicateKey { key },
            location,
        }));
    }

    /// Reports `kind` at `path`, keeping `source` as the cause.
    fn report_caused(
        &mut self,
        path: DefinitionPath,
        kind: IssueKind,
        source: impl Error + Send + Sync + 'static,
    ) {
        let issue = self.issue(path, kind);
        self.issues.push(Report::new(source).change_context(issue));
    }

    /// Replaces the placeholders in `text`, reporting a failure at `path`.
    fn resolve(&mut self, text: &str, path: &DefinitionPath) -> Option<String> {
        self.variables
            .resolve(text)
            .map_err(|kind| self.report(path.clone(), kind))
            .ok()
    }

    /// Records the location of `value` at `path` and returns its text with placeholders
    /// replaced.
    fn text(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Option<String> {
        self.locate(path, location(value));
        self.resolve(&value.value, path)
    }

    fn parse_name<T: FromStr<Err = InvalidName>>(
        &mut self,
        text: String,
        path: &DefinitionPath,
    ) -> Option<T> {
        T::from_str(&text)
            .map_err(|reason| {
                self.report(
                    path.clone(),
                    IssueKind::InvalidName {
                        value: text,
                        reason,
                    },
                );
            })
            .ok()
    }

    fn name<T: FromStr<Err = InvalidName>>(
        &mut self,
        value: &Spanned<String>,
        path: &DefinitionPath,
    ) -> Option<T> {
        let text = self.text(value, path)?;
        self.parse_name(text, path)
    }

    /// Returns the column name in `text`, which has no location of its own. Issues use the
    /// location of `path`.
    fn column(&mut self, text: &str, path: &DefinitionPath) -> Option<ColumnName> {
        let text = self.resolve(text, path)?;
        self.parse_name(text, path)
    }

    fn parse_url(&mut self, text: String, path: &DefinitionPath) -> Option<VersionedUrl> {
        VersionedUrl::from_str(&text)
            .map_err(|error| {
                self.report_caused(
                    path.clone(),
                    IssueKind::InvalidTypeUrl { value: text },
                    error,
                );
            })
            .ok()
    }

    fn url(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Option<VersionedUrl> {
        let text = self.text(value, path)?;
        self.parse_url(text, path)
    }

    fn query(&mut self, value: &Spanned<String>, path: &DefinitionPath) -> Option<SqlQuery> {
        let text = self.text(value, path)?;
        SqlQuery::try_from(text)
            .map_err(|error| self.report_caused(path.clone(), IssueKind::EmptySql, error))
            .ok()
    }

    /// Returns the text of a map key with placeholders replaced, and the path of its entry.
    fn key(
        &mut self,
        key: &Spanned<String>,
        map_path: &DefinitionPath,
    ) -> Option<(String, DefinitionPath)> {
        let written_path = map_path.clone().key(&key.value);
        self.locate(&written_path, location(key));
        let text = self.resolve(&key.value, &written_path)?;
        let path = map_path.clone().key(&text);
        self.locate(&path, location(key));
        Some((text, path))
    }

    /// Lowers a map whose keys are names, reporting keys that collide after interpolation.
    fn map<K, S, V>(
        &mut self,
        map: &SpannedMap<S>,
        map_path: &DefinitionPath,
        mut lower_value: impl FnMut(&mut Self, &S, &DefinitionPath) -> Option<V>,
    ) -> Option<BTreeMap<K, V>>
    where
        K: Ord + FromStr<Err = InvalidName>,
    {
        let mut lowered = BTreeMap::new();
        let mut complete = true;

        for (key, value) in map.iter() {
            let Some((text, path)) = self.key(key, map_path) else {
                complete = false;
                continue;
            };
            let name = self.parse_name::<K>(text.clone(), &path);
            let value = lower_value(self, value, &path);
            let (Some(name), Some(value)) = (name, value) else {
                complete = false;
                continue;
            };
            if lowered.insert(name, value).is_some() {
                self.report_duplicate(path, location(key), text);
            }
        }

        complete.then_some(lowered)
    }

    fn primary_key(
        &mut self,
        value: &Spanned<Vec<Spanned<String>>>,
        path: &DefinitionPath,
    ) -> Option<PrimaryKey> {
        self.locate(path, location(value));
        let columns = all(value
            .value
            .iter()
            .enumerate()
            .map(|(position, column)| {
                self.name::<ColumnName>(column, &path.clone().index(position))
            })
            .collect())?;
        PrimaryKey::new(columns)
            .map_err(|reason| {
                self.report(path.clone(), IssueKind::InvalidPrimaryKey { reason });
            })
            .ok()
    }

    /// Returns the definition's parts and locations, or every issue reported.
    fn finish(
        self,
        parts: Option<DefinitionParts>,
    ) -> Result<(DefinitionParts, Locations), Report<[DefinitionIssue]>> {
        if let Some(report) = self.issues.into_iter().collect::<Option<Report<[_]>>>() {
            return Err(report);
        }

        let parts = parts.expect("a part that failed to lower should have reported an issue");
        Ok((parts, self.locations))
    }
}

impl UnitMapSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<UnitMap> {
        let units = lowering.map::<UnitCode, _, _>(
            &self.units,
            &path.clone().field("units"),
            Lowering::url,
        );
        let fallback = self
            .fallback
            .as_ref()
            .map(|fallback| lowering.url(fallback, &path.clone().field("fallback")));

        let units = units?;
        let fallback = fallback.map_or(Some(None), |fallback| fallback.map(Some))?;
        UnitMap::new(units, fallback)
            .map_err(|error| lowering.report_caused(path.clone(), IssueKind::EmptyUnitMap, error))
            .ok()
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

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<Source> {
        let coverage = self.coverage.map_or(Coverage::Complete, Coverage::from);

        let kind = match (&self.sql, &self.checkpoint) {
            (Some(sql), None) => {
                let query = lowering.query(sql, &path.clone().field("sql"));
                let primary_key = if let Some(primary_key) = &self.primary_key {
                    lowering.primary_key(primary_key, &path.clone().field("primaryKey"))
                } else {
                    lowering.report(
                        path.clone(),
                        IssueKind::MissingField {
                            field: "primaryKey",
                        },
                    );
                    None
                };
                SourceKind::Sql {
                    query: query?,
                    primary_key: primary_key?,
                }
            }
            (None, Some(checkpoint)) => {
                if let Some(primary_key) = &self.primary_key {
                    let primary_key_path = path.clone().field("primaryKey");
                    lowering.locate(&primary_key_path, location(primary_key));
                    lowering.report(
                        primary_key_path,
                        IssueKind::UnexpectedField {
                            field: "primaryKey",
                        },
                    );
                }
                SourceKind::Checkpoint {
                    checkpoint: lowering.name(checkpoint, &path.clone().field("checkpoint"))?,
                }
            }
            (None, None) => {
                lowering.report(
                    path.clone(),
                    IssueKind::MissingKind {
                        expected: Self::KINDS,
                    },
                );
                return None;
            }
            (Some(_), Some(_)) => {
                lowering.report(
                    path.clone(),
                    IssueKind::ConflictingKinds {
                        found: Self::KINDS.to_vec(),
                    },
                );
                return None;
            }
        };

        Some(Source { kind, coverage })
    }
}

impl Document {
    /// Lowers the document to the parts of a definition, and records where each part is.
    ///
    /// # Errors
    ///
    /// Returns every issue found while lowering, each with its source location.
    /// [`Definition::new`](crate::Definition::new) checks the parts against each other
    /// afterwards.
    pub(in crate::yaml) fn lower(
        &self,
    ) -> Result<(DefinitionParts, Locations), Report<[DefinitionIssue]>> {
        let mut lowering = Lowering::new(&self.vars);

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

        let parts = (|| {
            Some(DefinitionParts {
                connector: connector?,
                sources: sources?,
                unit_maps: unit_maps?,
                entity_pipelines: entity_pipelines?,
                link_pipelines: link_pipelines?,
            })
        })();

        lowering.finish(parts)
    }
}
