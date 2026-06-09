-- Sprint 18.5 — reservation_history. One row per reservation seen
-- in any scrape; upserted by `server/forecast/runScrape.js` after a
-- successful snapshot insert.
--
-- The point of this table is to **survive snapshot pruning**.
-- forecast_snapshot.payload's bulky raw `reservations[]` array can
-- now be safely dropped after N days (admin-configurable) without
-- losing the FD's ability to look up past guests / past stays:
-- reservation_history holds the canonical record forever, with
-- first_seen_at + last_seen_at tracing the row's lifetime in our
-- system.
--
-- Columns mirror the shape we already produce in
-- `compute.js → reservationsOut`. Booleans default false. Status
-- fields are kept at their last-observed value (so cancellations,
-- room moves, etc. flow through naturally on each upsert).

BEGIN;

CREATE TABLE reservation_history (
  reservation_id            UUID         PRIMARY KEY,
  confirmation_id           VARCHAR(40),
  guest_name                VARCHAR(200),
  primary_guest_profile_id  VARCHAR(50),
  arrival_date              DATE,
  departure_date            DATE,
  nights                    INT,
  room_id                   VARCHAR(50),
  room_number               VARCHAR(20),
  floor_id                  VARCHAR(10),
  type_code                 VARCHAR(20),
  base_code                 VARCHAR(10),
  base_label                VARCHAR(100),
  sub_label                 VARCHAR(100),
  source                    VARCHAR(50),
  status                    VARCHAR(20),
  status_label              VARCHAR(40),
  kind                      VARCHAR(20),
  vip_uuid                  UUID,
  vip_label                 VARCHAR(100),
  is_pre_assigned           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_pet_friendly           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_group_booking          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_early_arrival          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_red_eye                BOOLEAN     NOT NULL DEFAULT FALSE,
  is_day_use                BOOLEAN     NOT NULL DEFAULT FALSE,
  is_high_floor             BOOLEAN     NOT NULL DEFAULT FALSE,
  scheduled_for_room_move   BOOLEAN     NOT NULL DEFAULT FALSE,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_snapshot_id          UUID        REFERENCES forecast_snapshot(snapshot_id) ON DELETE SET NULL
);

-- Lookups the FD does daily:
--   "show me all of today's arrivals" → arrival_date
--   "show me everything not-yet-checked-in" → status + arrival_date
--   "find Mary Johnson" → guest_name (case-insensitive)
--   "what scraped most recently?" → last_seen_at
CREATE INDEX idx_reservation_history_arrival      ON reservation_history(arrival_date DESC);
CREATE INDEX idx_reservation_history_status_arr   ON reservation_history(status, arrival_date DESC);
CREATE INDEX idx_reservation_history_last_seen    ON reservation_history(last_seen_at DESC);
CREATE INDEX idx_reservation_history_guest_lower  ON reservation_history(LOWER(guest_name));

COMMIT;
