//! The delivery vocabulary of one request.
//!
//! A corpus-bearing response reads a proof, a census, a schedule and a cut offset. The proof states
//! which rows the scope may see. The census states what that view aggregates to over the whole
//! corpus. The schedule states which cascade orders its delivery. The cut offset states where that
//! cascade is read. A scope resolution produces the proof, the census and the schedule once, the
//! presented token seals the cut offset per request, and [`View`] binds them together.
//!
//! Binding holds the pairing laws. A census and a schedule each travel with the proof that produced
//! them, and each [`ViewSchedule`] variant pairs with exactly one proof constructor. One
//! constructor checks every pairing at the request boundary, so assembly receives a view already
//! holding its resolved cut and every assembly rejection is about the request.

use core::{error::Error, fmt};

use hashql_core::id::IdSlice;

use super::{
    Atlas, ViewCensus, VisibilityProof,
    cache::CacheEntry,
    delta::{DeltaSnapshot, PlacementCohort},
    density::CutOffset,
    grid::Grid,
    schedule::{
        ArrivalIndex, ArrivalOverlay, ArrivalRow, ScheduleWidthError, ViewSchedule,
        cut::ScheduleCut,
    },
    visibility::ProofKind,
};

/// A delivery view that does not bind.
///
/// Every variant names an input this process produced rather than a request the caller shaped. A
/// transport answers [`ViewError::Contract`] and [`ViewError::Schedule`] with its internal problem.
/// [`ViewError::Offset`] is the one a caller can act on. Its token sealed an offset under a
/// contract this process no longer serves, and a fresh mint reseals it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ViewError {
    /// The proof and the schedule it travelled with pair the wrong variants.
    ///
    /// Each proof constructor pairs with exactly one [`ViewSchedule`] variant, and binding refuses
    /// a mismatched pair rather than serving either contract.
    Contract,
    /// The resolved cut offset lies past the key width.
    ///
    /// A sealed offset resolves against this same generation's schedule, so an out-of-domain value
    /// is a defect to surface. Binding refuses it whole rather than clamping it or substituting
    /// another schedule.
    Schedule(ScheduleWidthError),
    /// An operator proof travelled with a nonzero delivery-cut offset.
    ///
    /// The corpus schedule has one cut per zoom and takes no offset, so an operator view serves at
    /// offset zero. A nonzero value means a mint sealed and declared an offset no route can serve,
    /// and binding refuses it rather than answering corpus bytes under a declared cut nothing
    /// produced.
    Offset(CutOffset),
}

impl fmt::Display for ViewError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Contract => fmt.write_str(
                "the visibility proof and its delivery schedule disagree about the serving \
                 contract",
            ),
            Self::Schedule(error) => error.fmt(fmt),
            Self::Offset(offset) => write!(
                fmt,
                "the operator proof carries the nonzero delivery-cut offset {}, which the corpus \
                 schedule cannot serve",
                offset.get(),
            ),
        }
    }
}

impl Error for ViewError {}

/// One request's bound delivery view.
///
/// The proof, the census resolved beside it, and the view's schedule read at the request's cut
/// offset. Every assembly path takes this value as its whole statement of visibility, so the
/// endpoints share one delivery vocabulary and one contract check.
///
/// The value borrows the resolution it binds, which a scope holds for its reuse window, so
/// construction costs only per-request arithmetic and repeats no per-scope work.
#[derive(Debug, Copy, Clone)]
pub(crate) struct View<'scope> {
    /// The rows the scope may see.
    proof: &'scope VisibilityProof,
    /// The corpus-wide census of what [`Self::proof`] admits, resolved with it.
    census: ViewCensus,
    /// The scope cascade read at the request's offset, absent under an operator proof.
    ///
    /// Absent exactly when the view serves the generation's corpus schedule. Binding established
    /// that equivalence, so the assembly paths read this one discriminant.
    cut: Option<ScheduleCut<'scope>>,
    /// The view's arrival overlay, taken from the schedule it bound.
    ///
    /// A bound cut merges it into every delivery query, and the corpus assembly reads it
    /// directly, because the corpus fast paths take no cut.
    overlay: &'scope ArrivalOverlay,
    /// The entry's placement cohort, the arrivals snapshot its resolution read.
    ///
    /// The cohort names the accepted row universe every wire decode in the request runs under,
    /// and the reverse lookup for the slots past the generation's fitted rows. The view's
    /// arrival tables derive from this same snapshot, so the vessels and the decodes agree on
    /// one publication.
    cohort: PlacementCohort<'scope>,
    /// The withdrawal snapshot captured at the request's ingress, absent before the first
    /// publication and for a serve that starts no consumer.
    ///
    /// One capture answers every admission in the request, so the delta-sensitive assembly stays
    /// a pure function of the generation, the request, the proof, and this one snapshot. The
    /// capture contributes current withdrawals alone.
    delta: Option<&'scope DeltaSnapshot>,
}

impl<'scope> View<'scope> {
    /// Binds one resolved scope's delivery inputs at `k`.
    ///
    /// An operator proof binds the corpus schedule with no cut, and a scoped proof its own cascade
    /// read at `k`. `delta` is the request's ingress withdrawal capture, carried whole to every
    /// admission: binding checks nothing about it, because absence is lawful before the first
    /// publication and the snapshot pairs with the request rather than with the scope.
    ///
    /// Caller requirement: `census` is [`Atlas::census`] of `proof`, `schedule` is
    /// [`ViewSchedule::of`] over that same proof, and `cohort` is the resolution's own - the
    /// snapshot the schedule folded its arrivals from. Binding checks only that the proof and
    /// the schedule name the same serving contract. A census resolved from another proof of the
    /// same shape passes that check, so the pairing is the caller's to hold.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Contract`] when `proof` and `schedule` pair the wrong variants,
    /// [`ViewError::Offset`] when an operator proof carries a nonzero `k`, and
    /// [`ViewError::Schedule`] when `k` resolves past the key width.
    pub(super) fn bind(
        grid: Grid,
        proof: &'scope VisibilityProof,
        census: ViewCensus,
        schedule: &'scope ViewSchedule,
        #[expect(
            clippy::min_ident_chars,
            reason = "`k` is the delivery-cut offset's name throughout the density contract"
        )]
        k: CutOffset,
        cohort: PlacementCohort<'scope>,
        delta: Option<&'scope DeltaSnapshot>,
    ) -> Result<Self, ViewError> {
        let (cut, overlay) = match (proof.kind(), schedule) {
            (ProofKind::Corpus, ViewSchedule::Corpus(_)) if k != CutOffset::ZERO => {
                return Err(ViewError::Offset(k));
            }
            (ProofKind::Corpus, ViewSchedule::Corpus(overlay)) => (None, overlay),
            (ProofKind::Scope, ViewSchedule::Scope(scope, overlay)) => (
                Some(scope.cut(overlay, grid, k).map_err(ViewError::Schedule)?),
                overlay,
            ),
            (ProofKind::Corpus, ViewSchedule::Scope(..))
            | (ProofKind::Scope, ViewSchedule::Corpus(_)) => {
                return Err(ViewError::Contract);
            }
        };

        Ok(Self {
            proof,
            census,
            cut,
            overlay,
            cohort,
            delta,
        })
    }

    /// Binds one held resolution at `k`.
    ///
    /// An entry's census and schedule both derive from that entry's own proof, so the pairing holds
    /// by construction.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Offset`] when the entry holds an operator proof and `k` is nonzero, and
    /// [`ViewError::Schedule`] when `k` resolves past the key width. [`ViewError::Contract`] is
    /// unreachable through this constructor, because the entry pairs its own proof with the
    /// schedule built over that proof.
    pub(crate) fn of(
        atlas: &Atlas,
        entry: &'scope CacheEntry,
        #[expect(
            clippy::min_ident_chars,
            reason = "`k` is the delivery-cut offset's name throughout the density contract"
        )]
        k: CutOffset,
        delta: Option<&'scope DeltaSnapshot>,
    ) -> Result<Self, ViewError> {
        Self::bind(
            atlas.grid,
            entry.proof(),
            *entry.census(),
            entry.view_schedule(),
            k,
            entry.cohort(),
            delta,
        )
    }

    /// Returns the rows the view may see.
    #[must_use]
    pub(crate) const fn proof(&self) -> &'scope VisibilityProof {
        self.proof
    }

    /// Returns the corpus-wide census of what the proof admits.
    #[must_use]
    pub(crate) const fn census(&self) -> ViewCensus {
        self.census
    }

    /// Returns the bound scope cut, [`None`] under an operator proof.
    pub(super) const fn cut(&self) -> Option<ScheduleCut<'scope>> {
        self.cut
    }

    /// Returns the view's arrival overlay.
    ///
    /// Empty for a scope that folded its arrivals into its own cascade, and for a view whose
    /// resolution read no cohort.
    pub(super) const fn overlay(&self) -> &'scope ArrivalOverlay {
        self.overlay
    }

    /// Views the arrival table the delivered [`ViewRow::Arrival`] vessels address.
    ///
    /// The bound cut answers under a scoped proof and the overlay under an operator proof, so
    /// one table serves each view.
    ///
    /// [`ViewRow::Arrival`]: super::schedule::ViewRow::Arrival
    pub(crate) const fn arrivals(&self) -> &'scope IdSlice<ArrivalIndex, ArrivalRow> {
        match self.cut {
            Some(cut) => cut.arrivals(),
            None => self.overlay.arrivals(),
        }
    }

    /// Returns the ingress withdrawal snapshot, [`None`] before the first publication.
    pub(super) const fn delta(&self) -> Option<&'scope DeltaSnapshot> {
        self.delta
    }

    /// Returns the entry's placement cohort, the arrivals snapshot its resolution read.
    pub(super) const fn cohort(&self) -> PlacementCohort<'scope> {
        self.cohort
    }
}
