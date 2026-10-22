CREATE TABLE user_jellyfin (
  user_id text PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  url text NOT NULL,
  server_name text NOT NULL,
  credential text NOT NULL,
  jellyfin_user_id text
);
