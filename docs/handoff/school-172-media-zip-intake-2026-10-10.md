# School batch intake / 2026-10-10

Source ZIP: `jiuchen_school_172_simple_media_addresses_2026-10-10(1).zip` (provided by project owner).

Inspection confirmed 172 ordered IDs, 172 primary-address strings, 25 supplemental multi-campus records, 11 direct image URL candidates, **zero WebP image binaries**. ZIP includes an offline fetch/convert script and checksum manifest. Do not claim the 172 photos are complete.

The 11 direct URLs are recorded in `packages/schools/official-photo-candidates.ts` as discovery candidates only. They are NOT connected to rendering without source verification, image download, SHA-256 record, school-name match and policy/authorization review. Existing 5 credited photos and campus point data are retained. School location map uses GCJ-02; plaintext addresses alone cannot be mapped into coordinates.

Bulk ingestion still needs user ZIP materialization in the local git worktree, running `scripts/validate.py` and `scripts/fetch_all_hero_webp.py`, checking `reports/fetch_results.csv`, and reviewing results before CloudBase upload and URL binding. The ZIP's `authorized_by_project_owner` field is a claim supplied with the data, not an independent legal clearance audit; retain provenance per image.

Do not ship `assets/webp/` as 172 bundled client images; approved WebP photos should be hosted in compliant cloud storage and referenced after device testing. Do not replace richer, audited campus marker coordinates with raw mailing addresses.

Frontend style rule: all second-level cards in primary menus use saturated blue fills rather than pale, white or gray. Yellow is the restrained secondary accent; content is centered.
