# Local monitoring history

ProofLayer Continuous Verification stores append-only runtime history here:

```text
data/monitoring/<asset>/snapshots.jsonl
data/monitoring/<asset>/transitions.jsonl
```

The JSONL files are local MVP runtime state and are intentionally ignored by Git. They contain no private keys and no blockchain writes. The first explicit check establishes a baseline; only later semantic differences create transition records.
