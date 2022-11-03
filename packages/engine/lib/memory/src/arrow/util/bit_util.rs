// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

//! Utils for working with bits

use num::Integer;

const BIT_MASK: [u8; 8] = [1, 2, 4, 8, 16, 32, 64, 128];
const UNSET_BIT_MASK: [u8; 8] = [
    255 - 1,
    255 - 2,
    255 - 4,
    255 - 8,
    255 - 16,
    255 - 32,
    255 - 64,
    255 - 128,
];

/// Returns the nearest number that is `>=` than `num` and is a multiple of 64
#[inline]
pub fn round_upto_multiple_of_64(num: usize) -> usize {
    round_upto_power_of_2(num, 64)
}

/// Returns the nearest multiple of `factor` that is `>=` than `num`. Here `factor` must
/// be a power of 2.
pub fn round_upto_power_of_2(num: usize, factor: usize) -> usize {
    debug_assert!(factor > 0 && (factor & (factor - 1)) == 0);
    (num + (factor - 1)) & !(factor - 1)
}

/// Returns whether bit at position `i` in `data` is set or not
#[inline]
pub fn get_bit(data: &[u8], i: usize) -> bool {
    (data[i >> 3] & BIT_MASK[i & 7]) != 0
}

/// Returns whether bit at position `i` in `data` is set or not.
///
/// # Safety
///
/// Note this doesn't do any bound checking, for performance reason. The caller is
/// responsible to guarantee that `i` is within bounds.
#[inline]
pub unsafe fn get_bit_raw(data: *const u8, i: usize) -> bool {
    (*data.add(i >> 3) & BIT_MASK[i & 7]) != 0
}

/// Sets bit at position `i` for `data` to 1
#[inline]
pub fn set_bit(data: &mut [u8], i: usize) {
    data[i >> 3] |= BIT_MASK[i & 7];
}

/// Sets bit at position `i` for `data`
///
/// # Safety
///
/// Note this doesn't do any bound checking, for performance reason. The caller is
/// responsible to guarantee that `i` is within bounds.
#[inline]
pub unsafe fn set_bit_raw(data: *mut u8, i: usize) {
    *data.add(i >> 3) |= BIT_MASK[i & 7];
}

/// Sets bit at position `i` for `data` to 0
#[inline]
pub fn unset_bit(data: &mut [u8], i: usize) {
    data[i >> 3] &= UNSET_BIT_MASK[i & 7];
}

/// Sets bit at position `i` for `data` to 0
///
/// # Safety
///
/// Note this doesn't do any bound checking, for performance reason. The caller is
/// responsible to guarantee that `i` is within bounds.
#[inline]
pub unsafe fn unset_bit_raw(data: *mut u8, i: usize) {
    *data.add(i >> 3) &= UNSET_BIT_MASK[i & 7];
}

/// Returns the ceil of `value`/`divisor`
#[inline]
pub fn ceil(value: usize, divisor: usize) -> usize {
    // Rewrite as `value.div_ceil(&divisor)` after
    // https://github.com/rust-lang/rust/issues/88581 is merged.
    Integer::div_ceil(&value, &divisor)
}
