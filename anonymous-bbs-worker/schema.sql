DROP TABLE IF EXISTS posts;
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  delete_key TEXT NOT NULL,
  ip_address TEXT
);
CREATE INDEX idx_posts_created_at ON posts(created_at);
