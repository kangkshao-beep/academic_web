-- The counter stores only daily aggregate page views in China Standard Time (UTC+8).
CREATE TABLE IF NOT EXISTS traffic_daily (
  day TEXT PRIMARY KEY NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0)
);
