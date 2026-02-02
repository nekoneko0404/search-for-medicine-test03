DROP TABLE IF EXISTS posts;
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  post_number INTEGER,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  delete_key TEXT NOT NULL,
  ip_address TEXT,
  is_admin BOOLEAN DEFAULT 0
);
CREATE INDEX idx_posts_post_number ON posts(post_number);
CREATE INDEX idx_posts_created_at ON posts(created_at);
