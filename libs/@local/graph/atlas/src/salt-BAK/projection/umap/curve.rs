//! Fits the low-dimensional kernel curve from `spread` and `min_distance`.

use levenberg_marquardt::{LeastSquaresProblem, LevenbergMarquardt};
use nalgebra::{Dyn, OMatrix, U2, Vector2, storage::Owned};

use super::UmapError;

/// Number of evenly spaced distances sampled when fitting the curve. Matches
/// the 300-point grid used by `umap-learn`'s `find_ab_params`.
const CURVE_SAMPLES: usize = 300;

/// Coefficients of the low-dimensional membership kernel
/// `1 / (1 + a * d^(2b))`.
///
/// The parameters are always finite and positive. Obtain them with
/// [`fit_curve_parameters`] rather than constructing them from arbitrary
/// values.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CurveParameters {
    pub(super) a: f64,
    pub(super) b: f64,
}

impl CurveParameters {
    /// Accepts finite, positive coefficients.
    ///
    /// # Errors
    ///
    /// Returns [`UmapError::InvalidCurve`] when either coefficient is not
    /// finite and positive.
    pub(super) fn new(a: f64, b: f64) -> Result<Self, UmapError> {
        if !a.is_finite() || a <= 0.0 || !b.is_finite() || b <= 0.0 {
            return Err(UmapError::InvalidCurve { a, b });
        }
        Ok(Self { a, b })
    }
}

/// Fits kernel coefficients so that membership decays like
/// `exp(-(d - min_distance) / spread)` beyond `min_distance`.
///
/// This reproduces `umap-learn`'s `find_ab_params`: the target curve is
/// sampled at 300 distances across `[0, 3 * spread]` and the kernel is fitted
/// by Levenberg-Marquardt least squares.
///
/// # Errors
///
/// Returns an error when `spread` is not finite and positive, when
/// `min_distance` is outside `[0, spread]`, or when the least-squares fit
/// fails to converge to finite, positive coefficients.
pub(crate) fn fit_curve_parameters(
    spread: f64,
    min_distance: f64,
) -> Result<CurveParameters, UmapError> {
    if !spread.is_finite() || spread <= 0.0 {
        return Err(UmapError::InvalidSpread(spread));
    }
    if !min_distance.is_finite() || min_distance < 0.0 || min_distance > spread {
        return Err(UmapError::InvalidMinDistance {
            min_distance,
            spread,
        });
    }

    let denominator = (CURVE_SAMPLES - 1) as f64;
    let mut x = Vec::with_capacity(CURVE_SAMPLES);
    let mut y = Vec::with_capacity(CURVE_SAMPLES);
    for index in 0..CURVE_SAMPLES {
        let distance = spread * 3.0 * index as f64 / denominator;
        let target = if distance < min_distance {
            1.0
        } else {
            (-(distance - min_distance) / spread).exp()
        };
        x.push(distance);
        y.push(target);
    }

    let problem = CurveFitProblem {
        parameters: Vector2::new(1.0, 1.0),
        x,
        y,
    };
    let (problem, report) = LevenbergMarquardt::new().minimize(problem);
    if !report.termination.was_successful() {
        return Err(UmapError::CurveFitFailed);
    }

    CurveParameters::new(problem.parameters.x, problem.parameters.y)
}

/// Least-squares residuals of the kernel against the sampled target curve.
struct CurveFitProblem {
    parameters: Vector2<f64>,
    x: Vec<f64>,
    y: Vec<f64>,
}

impl LeastSquaresProblem<f64, Dyn, U2> for CurveFitProblem {
    type JacobianStorage = Owned<f64, Dyn, U2>;
    type ParameterStorage = Owned<f64, U2>;
    type ResidualStorage = Owned<f64, Dyn>;

    fn set_params(&mut self, parameters: &Vector2<f64>) {
        self.parameters = *parameters;
    }

    fn params(&self) -> Vector2<f64> {
        self.parameters
    }

    fn residuals(&self) -> Option<nalgebra::DVector<f64>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        if !a.is_finite() || !b.is_finite() {
            return None;
        }

        let residuals = nalgebra::DVector::from_iterator(
            self.x.len(),
            self.x.iter().zip(&self.y).map(|(&x, &target)| {
                let curve = 1.0 / (1.0 + a * x.powf(2.0 * b));
                curve - target
            }),
        );
        residuals
            .iter()
            .all(|value| value.is_finite())
            .then_some(residuals)
    }

    fn jacobian(&self) -> Option<OMatrix<f64, Dyn, U2>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        let mut jacobian = OMatrix::<f64, Dyn, U2>::zeros_generic(Dyn(self.x.len()), U2);

        for (row, &x) in self.x.iter().enumerate() {
            if x == 0.0 {
                continue;
            }
            let power = x.powf(2.0 * b);
            let denominator = (1.0 + a * power).powi(2);
            jacobian[(row, 0)] = -power / denominator;
            jacobian[(row, 1)] = -(2.0 * a * power * x.ln()) / denominator;
        }

        jacobian
            .iter()
            .all(|value| value.is_finite())
            .then_some(jacobian)
    }
}
