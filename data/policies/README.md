# Local Policy Studio history

Policy versions and evaluations are stored as deterministic append-only JSONL at runtime.

- `policies.jsonl` preserves saved policy versions and metadata revisions.
- `evaluations/<policy-id>.jsonl` binds every historical decision to its policy version and off-chain commitment.

Runtime JSONL files are intentionally gitignored. This MVP storage is local and single-process; it contains no secrets and performs no blockchain writes.
