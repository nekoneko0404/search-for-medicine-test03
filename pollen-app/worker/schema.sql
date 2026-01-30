DROP TABLE IF EXISTS subscribers;
CREATE TABLE subscribers (
  endpoint TEXT PRIMARY KEY,
  keys TEXT NOT NULL, -- JSON string of {auth, p256dh}
  city_code TEXT NOT NULL,
  city_name TEXT,
  threshold_hourly INTEGER DEFAULT 30,
  threshold_daily INTEGER DEFAULT 150,
  created_at INTEGER
);
