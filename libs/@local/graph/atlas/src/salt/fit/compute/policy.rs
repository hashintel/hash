//! The policy stage: classification and precedence resolution.

use alloc::collections::BTreeSet;

use super::{
    super::{
        error::StageError,
        role::{Role, stage, write_staged},
    },
    ClassifierPlan, Context,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, OntologyRowId},
    file::{
        array::ArrayFile,
        repository::RepositoryFile,
        salt::metadata::{
            ClassifierEvidence, ClassifierFitSummary, HoldoutEvidence, HoldoutRecord,
            PolicyEvidence,
        },
    },
    integrity::Sha256Digest,
    math::AlignedVecN,
    salt::policy::{
        Classification, GeometryClass,
        annotation::assembly::AssembledCorpus,
        artifact::write_policies,
        classifier::{Classifier, TrainingSet, fit as fit_classifier},
        resolve,
    },
};

/// The staged policy artifacts of one fit: the classifier beside the policy table it resolved.
pub(super) struct PolicyArtifacts {
    pub classifier: RepositoryFile,
    pub policy: RepositoryFile,
    pub evidence: PolicyEvidence,
}

/// The staged annotation artifacts of one in-run classifier fit.
///
/// The corpus document beside the embedding table it assembled to.
pub(super) struct AnnotationArtifacts {
    pub corpus: RepositoryFile,
    pub embeddings: RepositoryFile,
    pub hashes: RepositoryFile,
}

/// The classifier stage's evidence and staged files.
pub(super) struct ClassifierArtifacts {
    pub evidence: ClassifierEvidence,
    pub annotation: Option<AnnotationArtifacts>,
}

impl Context<'_> {
    /// Classifies every relation type's card.
    ///
    /// Resolves the policy table, and stages the classifier beside it.
    ///
    /// The relation universe is the distinct ontology rows the edge stream carried; each indexes
    /// the staged card table, which is row-aligned with the type table. Every card exists, so every
    /// relation classifies.
    pub(super) fn stage_policy(
        &self,
        classifier: &Classifier,
        relations: &[OntologyRowId],
    ) -> Result<PolicyArtifacts, StageError> {
        let _span = tracing::info_span!("policy").entered();

        let classifier_file = stage(self.staging, Role::Classifier, classifier)?;

        let cards = ArrayFile::open(self.staging.path_of(&Role::CardEmbeddings.file_name()))
            .map_err(StageError::MapCards)?;
        let embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>] = cards
            .vectors()
            .expect("the card matrix was sealed as f32 rows of the canonical width");

        let classifications = relations
            .iter()
            .map(|&relation| {
                classifier
                    .predict(&embeddings[relation.usize()])
                    .map(|prediction| (relation, Classification::Predicted(prediction)))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let policies = resolve(
            &classifications,
            &self.config.policy.overrides,
            self.config.policy.admission,
        )?;

        let policy_file = write_staged(self.staging, Role::Policy, |writer| {
            write_policies(&policies, writer)
        })?;

        let overridden = self
            .config
            .policy
            .overrides
            .iter()
            .map(|record| record.relation.get())
            .collect::<BTreeSet<_>>()
            .len() as u64;

        let evidence = PolicyEvidence {
            relations: policies.len() as u64,
            overridden,
        };
        tracing::info!(
            relations = evidence.relations,
            overridden = evidence.overridden,
            "staged the classifier and the resolved policy table"
        );

        Ok(PolicyArtifacts {
            classifier: classifier_file,
            policy: policy_file,
            evidence,
        })
    }

    /// Obtains the run's relation-policy classifier.
    ///
    /// A supplied model passes through, and an assembled corpus fits one, staging the annotation
    /// artifacts and recording the fit and holdout evidence.
    pub(super) fn acquire_classifier(
        &self,
        plan: &ClassifierPlan,
    ) -> Result<(Classifier, ClassifierArtifacts), StageError> {
        match plan {
            ClassifierPlan::Use { classifier, source } => Ok((
                classifier.clone(),
                ClassifierArtifacts {
                    evidence: ClassifierEvidence::Supplied { source: *source },
                    annotation: None,
                },
            )),
            ClassifierPlan::Fit {
                corpus,
                source,
                staged,
            } => self.fit_classifier(corpus, *source, staged),
        }
    }

    /// Fits the classifier from the assembled corpus.
    ///
    /// Evaluates it on the corpus's holdout cards.
    fn fit_classifier(
        &self,
        corpus: &AssembledCorpus,
        source: Sha256Digest,
        staged: &RepositoryFile,
    ) -> Result<(Classifier, ClassifierArtifacts), StageError> {
        let span = tracing::info_span!("classifier").entered();

        let embeddings = write_staged(self.staging, Role::AnnotationEmbeddings, |writer| {
            corpus.table().write_embeddings_into(writer)
        })?;
        let hashes = write_staged(self.staging, Role::AnnotationHashes, |writer| {
            corpus.table().write_hashes_into(writer)
        })?;

        // The trained rows lead the embedding table; the holdout rows
        // after them are evaluation material.
        let rows = corpus.table().rows();
        let training = TrainingSet::new(&rows[..corpus.rows().len()], corpus.rows())
            .map_err(StageError::ClassifierTraining)?;
        let fitted = fit_classifier(training, self.config.policy.classifier_fit)
            .map_err(StageError::ClassifierFit)?;

        let mut evaluated = 0_usize;
        let mut agreements = 0_usize;
        let mut cards = Vec::with_capacity(corpus.holdouts().len());
        for holdout in corpus.holdouts() {
            let prediction = fitted
                .classifier
                .predict(&rows[holdout.row])
                .map_err(StageError::Classify)?;
            let predicted = GeometryClass::VARIANTS
                .into_iter()
                .max_by(|left, right| {
                    prediction
                        .calibrated
                        .probability(*left)
                        .total_cmp(&prediction.calibrated.probability(*right))
                })
                .unwrap_or_else(|| unreachable!("the class set is nonempty"));

            let agree = holdout.verdict.geometry().map(|human| human == predicted);
            if let Some(agree) = agree {
                evaluated += 1;
                agreements += usize::from(agree);
            }

            cards.push(HoldoutRecord {
                identity: holdout.identity.canonical_url(),
                human: holdout.verdict,
                predicted,
                agree,
            });
        }

        let evidence = corpus.evidence();
        tracing::info!(
            trained = evidence.trained,
            fold_groups = evidence.fold_groups,
            iterations = fitted.evidence.iterations,
            holdouts = cards.len(),
            evaluated,
            agreements,
            "fitted the relation classifier from the annotation corpus"
        );
        drop(span);

        Ok((
            fitted.classifier,
            ClassifierArtifacts {
                evidence: ClassifierEvidence::Fitted {
                    corpus: source,
                    assembly: *evidence,
                    fit: ClassifierFitSummary {
                        folds: self.config.policy.classifier_fit.folds,
                        iterations: fitted.evidence.iterations,
                        raw_cross_entropy: fitted.evidence.raw_cross_entropy,
                        calibrated_cross_entropy: fitted.evidence.calibrated_cross_entropy,
                        raw_brier: fitted.evidence.raw_brier,
                        calibrated_brier: fitted.evidence.calibrated_brier,
                    },
                    holdout: HoldoutEvidence {
                        evaluated,
                        agreements,
                        cards,
                    },
                },
                annotation: Some(AnnotationArtifacts {
                    corpus: staged.clone(),
                    embeddings,
                    hashes,
                }),
            },
        ))
    }
}
