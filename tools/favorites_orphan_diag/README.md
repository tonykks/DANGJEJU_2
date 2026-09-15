# Favorites orphan diagnosis / cleanup

Read-only scan (default) and optional delete of favorite docs whose `places/{placeId}` no longer exists.

```powershell
# Full scan only
python tools/favorites_orphan_diag/cleanup.py

# Delete confirmed orphans only (ADC, project gate)
python tools/favorites_orphan_diag/cleanup.py --apply --confirm-project=dangjeju
```

Does **not** modify favorites whose Place exists. Does not change app source.
Evidence under `private_probe/favorites_orphan_diag/` (local-only).
