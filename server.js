
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const PORT = process.env.PORT || 3000;
const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "data", "bluebook.sqlite");

fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), {
  recursive: true
});

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, post_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, friend_id),
  CHECK(user_id <> friend_id)
);
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: path.dirname(path.resolve(DB_PATH))
  }),
  secret:
    process.env.SESSION_SECRET ||
    "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    created_at: user.created_at
  };
}

function currentUser(req) {
  if (!req.session.userId) return null;

  return db.prepare(`
    SELECT id, name, email, bio, created_at
    FROM users WHERE id = ?
  `).get(req.session.userId);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Please sign in to continue."
    });
  }

  next();
}

function postShape(row, viewerId) {
  const liked = viewerId
    ? !!db.prepare(`
        SELECT 1 FROM likes
        WHERE user_id = ? AND post_id = ?
      `).get(viewerId, row.id)
    : false;

  const comments = db.prepare(`
    SELECT c.id, c.body, c.created_at,
           u.id AS user_id, u.name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.id ASC LIMIT 20
  `).all(row.id);

  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author: {
      id: row.user_id,
      name: row.name,
      bio: row.bio || ""
    },
    like_count: row.like_count,
    comment_count: row.comment_count,
    liked,
    comments
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ user: safeUser(currentUser(req)) });
});

app.post("/api/register", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 60);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2) {
    return res.status(400).json({
      error: "Name must be at least 2 characters."
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({
      error: "Password must contain 8–200 characters."
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run(name, email, bcrypt.hashSync(password, 12));

    req.session.userId = Number(result.lastInsertRowid);

    res.status(201).json({
      user: safeUser(currentUser(req))
    });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({
        error: "An account with that email already exists."
      });
    }

    console.error(error);
    res.status(500).json({
      error: "Could not create account."
    });
  }
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = db.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({
      error: "Email or password is incorrect."
    });
  }

  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/posts", (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 100);
  let where = "";
  const params = [];

  if (query) {
    where = "WHERE p.body LIKE ? OR u.name LIKE ?";
    params.push(`%${query}%`, `%${query}%`);
  }

  const rows = db.prepare(`
    SELECT p.id, p.user_id, p.body, p.created_at,
           u.name, u.bio,
           (SELECT COUNT(*) FROM likes l
            WHERE l.post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments c
            WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ${where}
    ORDER BY p.id DESC LIMIT 50
  `).all(...params);

  res.json({
    posts: rows.map(row => postShape(row, req.session.userId))
  });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const body = String(req.body.body || "").trim();

  if (!body || body.length > 2000) {
    return res.status(400).json({
      error: "Post must contain 1–2,000 characters."
    });
  }

  const result = db.prepare(`
    INSERT INTO posts (user_id, body) VALUES (?, ?)
  `).run(req.session.userId, body);

  const row = db.prepare(`
    SELECT p.id, p.user_id, p.body, p.created_at,
           u.name, u.bio, 0 AS like_count,
           0 AS comment_count
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(Number(result.lastInsertRowid));

  res.status(201).json({
    post: postShape(row, req.session.userId)
  });
});

app.post("/api/posts/:id/like", requireAuth, (req, res) => {
  const postId = Number(req.params.id);

  if (!Number.isInteger(postId) ||
      !db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) {
    return res.status(404).json({ error: "Post not found." });
  }

  const existing = db.prepare(`
    SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?
  `).get(req.session.userId, postId);

  if (existing) {
    db.prepare(`
      DELETE FROM likes WHERE user_id = ? AND post_id = ?
    `).run(req.session.userId, postId);
  } else {
    db.prepare(`
      INSERT INTO likes (user_id, post_id) VALUES (?, ?)
    `).run(req.session.userId, postId);
  }

  res.json({
    liked: !existing,
    like_count: db.prepare(`
      SELECT COUNT(*) AS n FROM likes WHERE post_id = ?
    `).get(postId).n
  });
});

app.post("/api/posts/:id/comments", requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  const body = String(req.body.body || "").trim();

  if (!Number.isInteger(postId) ||
      !db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) {
    return res.status(404).json({ error: "Post not found." });
  }

  if (!body || body.length > 500) {
    return res.status(400).json({
      error: "Comment must contain 1–500 characters."
    });
  }

  const result = db.prepare(`
    INSERT INTO comments (user_id, post_id, body)
    VALUES (?, ?, ?)
  `).run(req.session.userId, postId, body);

  const comment = db.prepare(`
    SELECT c.id, c.body, c.created_at,
           u.id AS user_id, u.name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(Number(result.lastInsertRowid));

  res.status(201).json({ comment });
});

app.get("/api/people", (req, res) => {
  const viewerId = req.session.userId || 0;

  const people = db.prepare(`
    SELECT u.id, u.name, u.bio,
      EXISTS(
        SELECT 1 FROM friendships f
        WHERE f.user_id = ? AND f.friend_id = u.id
      ) AS is_friend
    FROM users u
    WHERE u.id <> ?
    ORDER BY u.id DESC LIMIT 8
  `).all(viewerId, viewerId);

  res.json({ people });
});

app.post("/api/people/:id/friend", requireAuth, (req, res) => {
  const friendId = Number(req.params.id);

  if (!Number.isInteger(friendId) ||
      friendId === req.session.userId ||
      !db.prepare("SELECT id FROM users WHERE id = ?").get(friendId)) {
    return res.status(404).json({ error: "Person not found." });
  }

  const existing = db.prepare(`
    SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?
  `).get(req.session.userId, friendId);

  if (existing) {
    db.prepare(`
      DELETE FROM friendships WHERE user_id = ? AND friend_id = ?
    `).run(req.session.userId, friendId);
  } else {
    db.prepare(`
      INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)
    `).run(req.session.userId, friendId);
  }

  res.json({ is_friend: !existing });
});

app.patch("/api/me", requireAuth, (req, res) => {
  const bio = String(req.body.bio || "").trim().slice(0, 180);

  db.prepare("UPDATE users SET bio = ? WHERE id = ?")
    .run(bio, req.session.userId);

  res.json({ user: safeUser(currentUser(req)) });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Something went wrong. Please try again."
  });
});

app.listen(PORT, () => {
  console.log(`BlueBook Social running on http://localhost:${PORT}`);
});
