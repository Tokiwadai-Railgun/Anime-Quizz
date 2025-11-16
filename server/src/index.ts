import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createClient } from '@libsql/client'
import { hash, verify } from 'argon2'
import crypto from "crypto";
import { error } from 'console';

const db = createClient({ url: "file:database.db" });
const app = new Hono()

initDatabase();

app.get('/', async (c) => {
    return c.text("Welcome to the api, please use the README to get all the possible endpoints");
})

app.get("/leaderboard", async (c) => {
    const res = await db.execute("SELECT * FROM leaderboard");
    return c.json(res.rows[0]);
})

app.post("/score", async (c) => {
    if (!c.req.header("Content-Type")?.includes("application/json")) {
        return c.json({ success: false, error: "Invalid Content-Type" }, 400);
    }

    const { token, score } = await c.req.json();

    if (!token || typeof score !== "number") {
        return c.json({ success: false, error: "Missing or invalid fields" }, 400);
    }

    // Verify session
    const sessionRes = await db.execute({
        sql: `
            SELECT user_id, expires_at
            FROM sessions
            WHERE token = ?
        `,
        args: [token]
    });

    // Verifying that the session is valid & with correct expiration
    const session = sessionRes.rows[0];
    if (!session) {
        return c.json({ success: false, error: "Invalid session" }, 401);
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
        return c.json({ success: false, error: "Session expired" }, 401);
    }

    const userId = session.user_id;

    // Update score
    await db.execute({
        sql: `
            UPDATE users
            SET score = ?
            WHERE id = ?
        `,
        args: [score, userId]
    });

    return c.json({ success: true });
});

app.post("/register", async (c) => {
    // Check the header
    if (!c.req.header("Content-Type")?.includes("application/json")) {
        return c.json({ success: false, error: "Invalid Content-Type" }, 400)
    }

    const { username, password } = await c.req.json()

    if (!username || !password) {
        return c.json({ success: false, error: "Missing fields" }, 400)
    }


    // register the user in the db
    const passwordHash = await hash(password);
    try {
        await db.execute({
            sql: `
                INSERT INTO users (username, password_hash)
                VALUES (?, ?)
            `,
            args: [username, passwordHash]
        });
    } catch (err) {
        return c.json({ success: false, error: "Username already exists" }, 409)
    }

    return c.json({ success: true })
});

// authenticate the user and return session token
app.post("/login", async (c) => {
    if (!c.req.header("Content-Type")?.includes("application/json")) {
        return c.json({ success: false, error: "Invalid Content-Type" }, 400)
    }

    const { username, password } = await c.req.json()
    if (!username || !password) {
        return c.json({ error: "Missing fields" }, 400)
    }

    // retrieve the user
    const result = await db.execute({
        sql: `SELECT id, password_hash FROM users WHERE username = ?`,
        args: [username]
    });

    const user = result.rows[0];
    if (!user) {
        return c.json({ success: false, error: "Invalid username or password" }, 401)
    }

    // Verify password
    const validPass = await verify(user.password_hash, password)
    if (!validPass) {
        return c.json({ success: false, error: "Invalid username or password" }, 401)
    }

    // Create session
    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() // 24h

    await db.execute({
        sql: `
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (?, ?, ?)
        `,
        args: [user.id, token, expiresAt]
    })

    return c.json({
        success: true,
        token,
        expiresAt
    })
})


const server = serve({
    fetch: app.fetch,
    port: 3000
}, (info) => {
        console.log(`Server is running on http://localhost:${info.port}`)
    })

process.on("SIGINT", () => {
    server.close()
    console.log("Closing");
    process.exit(0)
})

process.on('SIGTERM', () => {
    server.close((err) => {
        if (err) {
            console.error(err)
            process.exit(1)
        }
        process.exit(0)
    })
})


export async function initDatabase() {
    await db.execute(`
CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE NOT NULL,
password_hash TEXT NOT NULL,
score INTEGER NOT NULL DEFAULT 0,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

    await db.execute(`
CREATE TABLE IF NOT EXISTS sessions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
token TEXT UNIQUE NOT NULL,
expires_at TEXT NOT NULL,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

    await db.execute(`
CREATE VIEW IF NOT EXISTS leaderboard AS
SELECT id, username, score, created_at
FROM users
ORDER BY score DESC, created_at ASC;
`);

    console.log("Successfully initialised database");
}
