-- Each INSERT was billed as 7 writes (row + 6 indexes). The queries we
-- actually run filter on received_at / distinct_id. Drop the rest so a
-- kept event costs 3 writes instead of 7.
DROP INDEX IF EXISTS idx_events_event;
DROP INDEX IF EXISTS idx_events_tool;
DROP INDEX IF EXISTS idx_events_error_kind;
DROP INDEX IF EXISTS idx_events_error_code;
