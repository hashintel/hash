[apache license 2.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-APACHE.md
[contact us]: https://hash.ai/contact?utm_medium=organic&utm_source=github_license_repo-root-file
[gnu affero general public license 3.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-AGPL.md
[mit license]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-MIT.md
[hash license]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-HASH.md

# License

The vast majority of the HASH monorepo contains **open-source code** variously licensed under either:
- the [MIT License] and [Apache License 2.0] dually (default); or
- the [GNU Affero General Public License 3.0].

In the interests of transparency, certain proprietary code is also made available under the source-available [HASH License].

## 1. License Determination

**The following rules apply on the `main` branch only.** The license for a particular work is defined in accordance with the following prioritized rules (precedence established first-to-last):

1.  **If present:** license information directly present in the work file defines its license;
1.  **Else, if:** the work exists directly or indirectly inside a directory titled `_h`, the file is available under the [HASH License] only;
1.  **Else, if:** a `LICENSE`, `LICENSE.md` or `LICENSE.txt` file exists in the same directory as the work, this defines its license;
1.  **Else, if:** a `LICENSE`, `LICENSE.md` or `LICENSE.txt` file is found when exploring parent directories of the work up to the project top level directory, the first one encountered defines the license applicable to the work;
1.  **Otherwise:** by default, the work is dually available under both the [MIT License] and [Apache License 2.0], at your option.

No license is granted by HASH to work or files on branches other than `main`.

## 2. Quick Reference

As outlined by the license files in the respective directories:

- Within `/blocks` source code is (unless otherwise noted) generally available under either the [MIT License] or [Apache License 2.0], at your option.
- Within `/apps`, `/libs` and `/tests`, source code in sub-directories (including those which are nested) named `@local` or prefixed `hash` are typically licensed under the [GNU Affero General Public License 3.0].

These quick reference guidelines are provided as general heuristics only. In all cases, you should follow the above **license determination** rules, outlined in section 1 (above), to verify the actual terms under which work is available.

And remember: anything inside a directory titled `_h` (no matter how deeply nested within) is available under the [HASH License] only. This applies to code repo-wide (including to code within the aforementioned `/apps`, `/libs` and other directories).

## 3. Questions

If you require an alternative license, or have any other questions, please [contact us].
