-- Graveshift backend: accounts, rooms, matches, rating, friends, parties, reports. Times are unix seconds.
CREATE TABLE account (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, name TEXT NOT NULL DEFAULT 'Guest', friend_code TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL DEFAULT 1000, games INTEGER NOT NULL DEFAULT 0, season INTEGER NOT NULL DEFAULT 0,
  leaves INTEGER NOT NULL DEFAULT 0, ranked_block_until INTEGER NOT NULL DEFAULT 0, muted_until INTEGER NOT NULL DEFAULT 0,
  room TEXT, created INTEGER NOT NULL, seen INTEGER NOT NULL
);
CREATE INDEX account_rating ON account (season, rating DESC);

CREATE TABLE profile (account TEXT PRIMARY KEY, json TEXT NOT NULL, updated INTEGER NOT NULL);

CREATE TABLE stats (
  account TEXT NOT NULL, season INTEGER NOT NULL, mode TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0, matches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, season, mode)
);

CREATE TABLE room (
  code TEXT PRIMARY KEY, host TEXT NOT NULL, playlist TEXT NOT NULL, map TEXT NOT NULL, mode TEXT NOT NULL,
  size INTEGER NOT NULL, humans INTEGER NOT NULL, free INTEGER NOT NULL, started INTEGER NOT NULL DEFAULT 0,
  avg_rating INTEGER NOT NULL DEFAULT 1000, expires INTEGER NOT NULL
);
CREATE INDEX room_list ON room (playlist, expires);

CREATE TABLE game (
  id TEXT PRIMARY KEY, room TEXT NOT NULL, playlist TEXT NOT NULL, mode TEXT NOT NULL, map TEXT NOT NULL,
  started INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'live', roster TEXT NOT NULL, result TEXT
);

CREATE TABLE confirm (
  game TEXT NOT NULL, account TEXT NOT NULL, hash TEXT NOT NULL, json TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (game, account)
);

CREATE TABLE friend (a TEXT NOT NULL, b TEXT NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
CREATE INDEX friend_b ON friend (b);

CREATE TABLE recent (account TEXT NOT NULL, other TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account, other));

CREATE TABLE party (id TEXT PRIMARY KEY, leader TEXT NOT NULL, room TEXT, updated INTEGER NOT NULL);
CREATE TABLE party_member (account TEXT PRIMARY KEY, party TEXT NOT NULL);
CREATE INDEX party_member_party ON party_member (party);
CREATE TABLE invite (party TEXT NOT NULL, account TEXT NOT NULL, sender TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (party, account));

CREATE TABLE report (
  reporter TEXT NOT NULL, target TEXT NOT NULL, room TEXT NOT NULL, lines TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (reporter, target)
);
CREATE INDEX report_target ON report (target, at);
