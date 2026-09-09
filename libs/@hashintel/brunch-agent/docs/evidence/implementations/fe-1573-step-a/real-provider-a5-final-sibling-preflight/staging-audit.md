# Evidence staging order assertion

The initial inline staging audit successfully added exactly226 intentional evidence files and passed `git diff --cached --check`, then failed its final list-order assertion. It sorted intended `Path` objects by path components, converted them to strings, and compared them to globally lexically sorted Git output. That is not the same ordering. This was an evidence-audit assertion, not a frozen source/build/probe defect; no source or instrument bytes changed and no new freeze was generated.

Exact failing comparison:

```python
paths = [str(path) for path in sorted(root.rglob('*')) if path.is_file()]
# git add and git diff --cached --check both completed successfully.
staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], text=True).splitlines()
assert sorted(staged) == paths
```

Tool-returned stderr and exit:

```text
Traceback (most recent call last):
  File "<stdin>", line 9, in <module>
AssertionError

Command exited with code 1
```

The follow-up read-only comparison checked exact sets, cardinality, duplicates and consistently sorted strings. It made no staging/source change. Actual output:

```text
{'intended': 226, 'staged': 226, 'sameSet': True, 'duplicates': False, 'sameLexicographicOrder': True}
```

The final check uses exact set plus cardinality equality. This document adds the227th evidence file. The original225-entry artifact inventory stays byte-identical; this post-inventory audit is pinned by the evidence commit. No historical or current raw manifest/preflight/observation is rewritten. No unguarded network or paid command was involved.
