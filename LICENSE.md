The HASH monorepo relies upon multiple different licenses.

# License Guide

The license for a particular work is defined with following prioritized rules:
1. License information directly present in the file
1. `LICENSE`, `LICENSE.md` or `LICENSE.txt` file in the same directory as the work
1. First `LICENSE`, `LICENSE.md` or `LICENSE.txt` file found when exploring parent directories up to the project top level directory
1. Defaults to the MIT License

Source code in this repository is variously licensed under the _MIT License_,
the _GNU Affero General Public License 3.0_, or dual-licensed under both the
_Server Side Public License_ and _Elastic License 2.0_.

Written content, illustrations and graphics published under the `resources`
folder within this repository are made available under the [Creative Commons
Attribution-ShareAlike 4.0 International](resources/LICENSE.md) license.

# Quick Reference

* Within the `/packages/engine` folder, source code is dually-licensed under
  either the Server Side Public License or the Elastic License 2.0, unless
  otherwise noted, giving users the choice of which license to apply.
  
* Within the `/packages/hash` folder, source code in a given file is
  licensed under version 3 of the GNU Affero General Public License, unless
  otherwise noted.
  
* Outside of these directories, source code in a given file is licensed
  under the MIT License, unless otherwise noted (a) within the file, (b) in
  the metadata of a package (e.g. its `package.json` file) or (c) within a
  folder's `LICENSE.md` file (or that of its nearest parent).

If you have any questions please [contact us](https://hash.ai/contact].
