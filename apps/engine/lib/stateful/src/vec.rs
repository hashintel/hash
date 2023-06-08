#![allow(clippy::unsafe_derive_deserialize)]

use std::ops::{Add, AddAssign, Div, DivAssign, Index, IndexMut, Mul, MulAssign, Sub, SubAssign};

use serde::{Deserialize, Serialize};

/// A simple 3-dim vector with basic basic algebra functionality.
///
/// This types is used for convenient creation of 3-dim vectors from non-3-dim vectors.
///
/// # Examples
///
/// ```
/// use serde_json::json;
/// use stateful::Vec3;
///
/// assert_eq!(Vec3::from([1.0, 2.0]), Vec3(1.0, 2.0, 0.0));
/// assert_eq!(Vec3::try_from(json!([1.0_f64, 2.0]))?, Vec3(1.0, 2.0, 0.0));
/// # serde_json::Result::Ok(())
/// ```
#[derive(Clone, Serialize, Deserialize, Debug, Copy, PartialEq)]
// https://rust-lang.github.io/rust-clippy/master/index.html#unsafe_derive_deserialize
#[allow(clippy::module_name_repetitions)]
pub struct Vec3(
    #[serde(default)] pub f64,
    #[serde(default)] pub f64,
    #[serde(default)] pub f64,
);

impl Vec3 {
    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn origin() -> Self {
        Self(0.0, 0.0, 0.0)
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn x(&self) -> f64 {
        self.0
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn y(&self) -> f64 {
        self.1
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn z(&self) -> f64 {
        self.2
    }

    // TODO: UNUSED: Needs triage
    pub fn x_mut(&mut self) -> &mut f64 {
        &mut self.0
    }

    // TODO: UNUSED: Needs triage
    pub fn y_mut(&mut self) -> &mut f64 {
        &mut self.1
    }

    // TODO: UNUSED: Needs triage
    pub fn z_mut(&mut self) -> &mut f64 {
        &mut self.2
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn dot(self, vec: Vec3) -> f64 {
        self.0 * vec.0 + self.1 * vec.1 + self.2 * vec.2
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn magnitude(self) -> f64 {
        self.dot(self).sqrt()
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn norm(self) -> Vec3 {
        self / self.magnitude()
    }

    // TODO: I'm not sure if we want truncation vs rounding, so I'm marking this as allowed.
    // TODO: UNUSED: Needs triage
    #[allow(clippy::cast_possible_truncation)]
    #[must_use]
    pub fn as_grid(&self) -> [i64; 3] {
        [self.0 as i64, self.1 as i64, self.2 as i64]
    }
}

impl Index<usize> for Vec3 {
    type Output = f64;

    fn index(&self, index: usize) -> &Self::Output {
        match index {
            0 => &self.0,
            1 => &self.1,
            2 => &self.2,
            _ => panic!("Index {} out of bound", index),
        }
    }
}

impl IndexMut<usize> for Vec3 {
    fn index_mut(&mut self, index: usize) -> &mut f64 {
        match index {
            0 => &mut self.0,
            1 => &mut self.1,
            2 => &mut self.2,
            _ => panic!("Index {} out of bound", index),
        }
    }
}

impl Index<&str> for Vec3 {
    type Output = f64;

    fn index(&self, index: &str) -> &Self::Output {
        match index {
            "x" => &self.0,
            "y" => &self.1,
            "z" => &self.2,
            _ => panic!("Coord {} not valid", index),
        }
    }
}

impl IndexMut<&str> for Vec3 {
    fn index_mut(&mut self, index: &str) -> &mut f64 {
        match index {
            "x" => &mut self.0,
            "y" => &mut self.1,
            "z" => &mut self.2,
            _ => panic!("Coord {} not valid", index),
        }
    }
}

impl From<&[f64]> for Vec3 {
    fn from(v: &[f64]) -> Self {
        match v.len() {
            0 => Self(0.0, 0.0, 0.0),
            1 => Self(v[0], 0.0, 0.0),
            2 => Self(v[0], v[1], 0.0),
            _ => Self(v[0], v[1], v[2]),
        }
    }
}

impl From<[f64; 0]> for Vec3 {
    fn from(_v: [f64; 0]) -> Self {
        Self(0.0, 0.0, 0.0)
    }
}

impl From<[f64; 1]> for Vec3 {
    fn from(v: [f64; 1]) -> Self {
        Self(v[0], 0.0, 0.0)
    }
}

impl From<[f64; 2]> for Vec3 {
    fn from(v: [f64; 2]) -> Self {
        Self(v[0], v[1], 0.0)
    }
}

impl From<[f64; 3]> for Vec3 {
    fn from(v: [f64; 3]) -> Self {
        Self(v[0], v[1], v[2])
    }
}

impl From<Vec3> for [f64; 3] {
    fn from(v: Vec3) -> Self {
        [v.0, v.1, v.2]
    }
}

impl TryFrom<serde_json::Value> for Vec3 {
    type Error = serde_json::Error;

    fn try_from(value: serde_json::Value) -> Result<Self, Self::Error> {
        serde_json::from_value(value)
    }
}

impl Mul<f64> for Vec3 {
    type Output = Self;

    fn mul(mut self, rhs: f64) -> Self::Output {
        self.0 *= rhs;
        self.1 *= rhs;
        self.2 *= rhs;
        self
    }
}

impl MulAssign<f64> for Vec3 {
    fn mul_assign(&mut self, rhs: f64) {
        self.0 *= rhs;
        self.1 *= rhs;
        self.2 *= rhs;
    }
}

impl Div<f64> for Vec3 {
    type Output = Self;

    fn div(mut self, rhs: f64) -> Self::Output {
        self.0 /= rhs;
        self.1 /= rhs;
        self.2 /= rhs;
        self
    }
}

impl DivAssign<f64> for Vec3 {
    fn div_assign(&mut self, rhs: f64) {
        self.0 /= rhs;
        self.1 /= rhs;
        self.2 /= rhs;
    }
}

impl Add<Vec3> for Vec3 {
    type Output = Self;

    fn add(mut self, rhs: Vec3) -> Self::Output {
        self.0 += rhs.0;
        self.1 += rhs.1;
        self.2 += rhs.2;
        self
    }
}

impl AddAssign<Vec3> for Vec3 {
    fn add_assign(&mut self, rhs: Vec3) {
        self.0 += rhs.0;
        self.1 += rhs.1;
        self.2 += rhs.2;
    }
}

impl Sub<Vec3> for Vec3 {
    type Output = Self;

    fn sub(mut self, rhs: Vec3) -> Self::Output {
        self.0 -= rhs.0;
        self.1 -= rhs.1;
        self.2 -= rhs.2;
        self
    }
}

impl SubAssign<Vec3> for Vec3 {
    fn sub_assign(&mut self, rhs: Vec3) {
        self.0 -= rhs.0;
        self.1 -= rhs.1;
        self.2 -= rhs.2;
    }
}

impl Default for Vec3 {
    fn default() -> Self {
        [0.0, 0.0, 0.0].into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec3d() {
        let pos: Vec3 = [1.0, 2.0].into();

        assert_eq!(pos.0, 1.0);
        assert_eq!(pos.1, 2.0);
        assert_eq!(pos.2, 0.0);

        assert_eq!(pos[0], 1.0);
        assert_eq!(pos[1], 2.0);
        assert_eq!(pos[2], 0.0);

        assert_eq!(pos.x(), 1.0);
        assert_eq!(pos.y(), 2.0);
        assert_eq!(pos.z(), 0.0);

        let raw = [3.0, 4.0, 5.0];

        let slice = &raw[..];
        let pos: Vec3 = slice.into();

        assert_eq!(pos.0, 3.0);
        assert_eq!(pos.1, 4.0);
        assert_eq!(pos.2, 5.0);

        let mut pos: Vec3 = Vec3::origin();
        pos[0] = 5.0;
        *pos.y_mut() = 6.0;
        pos["z"] = 7.0;

        assert_eq!(pos["x"], 5.0);
        assert_eq!(pos["y"], 6.0);
        assert_eq!(pos["z"], 7.0);

        let a = Vec3(1.0, 2.0, 0.0);
        let b = Vec3(0.0, 0.0, 5.0);

        assert_eq!(a.dot(a), 5.0);
        assert_eq!(a.dot(b), 0.0);
    }
}
