ALTER TABLE events ADD COLUMN error_code TEXT;
ALTER TABLE events ADD COLUMN error_fields TEXT;
ALTER TABLE events ADD COLUMN error_detail TEXT;
ALTER TABLE events ADD COLUMN retry INTEGER;
ALTER TABLE events ADD COLUMN status TEXT;

CREATE INDEX idx_events_error_kind ON events (error_kind);
CREATE INDEX idx_events_error_code ON events (error_code);
