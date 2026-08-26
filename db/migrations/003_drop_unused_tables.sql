-- `place` and `report` are unreferenced by any application code path — no
-- route, no store function, no UI — and `place` isn't part of the current
-- data model in ARCHITECTURE.md's ER diagram either, despite the FK from
-- `source`. Re-add place (and repoint source.place_id) if the Map screen
-- (design doc D6) is ever actually built.
ALTER TABLE source DROP COLUMN IF EXISTS place_id;
DROP TABLE IF EXISTS place;
DROP TABLE IF EXISTS report;
