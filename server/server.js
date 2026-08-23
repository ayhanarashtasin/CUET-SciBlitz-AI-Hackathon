/**
 * Express server entry point for the TopKorbo platform.
 *
 * Configures middleware (CORS, body parsing, rate limiting, security headers),
 * mounts all API route modules (auth, questions, contests, forum, payments, etc.),
 * sets up Socket.IO for real-time features, and starts the HTTP server with
 * graceful shutdown on uncaught errors. Also runs periodic background tasks
 * (contest settlement, trending-score refresh) after boot.
 */

const originalEmitWarning = process.emitWarning;
process.emitWarning = function emitWarningExceptKnownDependencyNoise(warning, ...args) {
  const options = args[0] && typeof args[0] === "object" ? args[0] : null;
  const code = warning?.code || options?.code || args[1];

  // passport-oauth2 still calls Node's deprecated url.parse() internally.
  // Suppress only that dependency warning while keeping all other warnings visible.
  if (code === "DEP0169") return;

  return originalEmitWarning.call(process, warning, ...args);
};

const { execSync } = require("child_process");
const dns = require("node:dns");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

try {
  const mongoUri = process.env.MONGODB_URI || "";
  const isAtlasSrvUri =
    process.platform === "win32" && mongoUri.startsWith("mongodb+srv://");

  if (isAtlasSrvUri) {
    // Atlas SRV lookups are flaky on some Windows/router DNS setups.
    // Using clean public resolvers avoids the mixed-resolver failures that
    // cause `Server selection timed out` during startup.
    const atlasDnsServers = ["8.8.8.8", "1.1.1.1"];
    dns.setServers(atlasDnsServers);

    if (typeof dns.setDefaultResultOrder === "function") {
      dns.setDefaultResultOrder("ipv4first");
    }
  }
} catch (e) {
  console.log("Failed to configure DNS for MongoDB Atlas:", e.message);
}
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const landingRoutes = require("./routes/landingRoutes");
const authRoutes = require("./routes/authRoutes");
const questionRoutes = require("./routes/questionRoutes");
const contestRoutes = require("./routes/contestRoutes");
const battleRoutes = require("./routes/battleRoutes");
const bookRoutes = require("./routes/bookRoutes");
const highlightRoutes = require("./routes/highlightRoutes");
const evaluationRoutes = require("./routes/evaluationRoutes");
const aiRoutes = require("./routes/aiRoutes");
const mentorRoutes = require("./routes/mentorRoutes");
const academicRoutes = require("./routes/academicRoutes");
const mockTestRoutes = require("./routes/mockTestRoutes");
const liveClassRoutes = require("./routes/liveClassRoutes");
const ieltsRoutes = require("./routes/ieltsRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const supportRoutes = require("./routes/supportRoutes");
const adminRoutes = require("./routes/admin.routes");

// Community / Forum
const postRoutes = require("./routes/postRoutes");
const { postComments, router: commentRoutes } = require("./routes/commentRoutes");
const reactionRoutes = require("./routes/reactionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const searchRoutes = require("./routes/searchRoutes");
const moderationRoutes = require("./routes/moderationRoutes");
const userRoutes = require("./routes/userRoutes");
const practiceRoutes = require("./routes/practiceRoutes");
const studyRoutineRoutes = require("./routes/studyRoutineRoutes");
const { initSocket } = require("./socket");
const bootstrapAdmin = require("./scripts/bootstrapAdmin");

// Load Passport Configuration
require("./config/passport");

const { globalLimiter } = require("./middleware/rateLimiters");

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');

// Behind a single reverse proxy (Vercel/Render/Nginx) in production so that
// req.ip and rate limiting reflect the real client, not the proxy.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Dynamic API responses must always include a body. Browser revalidation can
// otherwise turn JSON endpoints such as /api/auth/me into empty 304 responses,
// which breaks callers that immediately parse response.json() after refresh.
app.set("etag", false);

// Fail closed on missing or placeholder JWT secret. The auth middleware
// (middleware/auth.js) and the socket.io handshake (socket/index.js) both
// rely on JWT_SECRET for token verification. Silently falling back to a
// hard-coded placeholder would let anyone forge tokens and take over
// accounts — including mentor accounts that can mint LiveKit room tokens.
const PLACEHOLDER_JWT_SECRETS = new Set(['24241122', 'changeme', 'secret', '']);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || PLACEHOLDER_JWT_SECRETS.has(jwtSecret)) {
  console.error(
    '\nFATAL: JWT_SECRET is missing or set to a known placeholder.\n' +
      'Set JWT_SECRET in server/.env to a strong random value, e.g.:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"\n',
  );
  process.exit(1);
}

if (process.env.VERCEL) {
  const missingVercelEnvironment = [
    'MONGODB_URI',
    'REDIS_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ].filter((name) => !process.env[name]);

  if (missingVercelEnvironment.length > 0) {
    console.error(
      `FATAL: missing required Vercel environment variables: ${missingVercelEnvironment.join(', ')}`
    );
    process.exit(1);
  }
}

// Connect to MongoDB
connectDB();

// CORS: restrict to an explicit allowlist in production. In development we
// default to the local Vite origins. Configure additional origins via
// CORS_ORIGINS (comma-separated) or FRONTEND_URL.
const corsAllowlist = new Set(
  [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(","),
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean),
);

function isAllowedCorsOrigin(origin, req) {
  if (!origin) return true;
  if (corsAllowlist.has(origin)) return true;

  try {
    const { hostname, host } = new URL(origin);
    const forwardedHost = String(req.get("x-forwarded-host") || "")
      .split(",")[0]
      .trim();
    if (host === req.get("host") || (forwardedHost && host === forwardedHost)) {
      return true;
    }
    return hostname === "sslcommerz.com" ||
      hostname.endsWith(".sslcommerz.com") ||
      hostname === "sslcommerz.com.bd" ||
      hostname.endsWith(".sslcommerz.com.bd");
  } catch (_) {
    return false;
  }
}

if (process.env.NODE_ENV === "production" && corsAllowlist.size === 0) {
  console.warn(
    "⚠️  CORS: no FRONTEND_URL/CORS_ORIGINS configured in production — " +
      "same-origin requests remain allowed; cross-origin requests are denied.",
  );
}

// SSLCommerz redirects the user's browser back to these endpoints via a
// cross-site POST after payment. Because the navigation arrives through the
// gateway/bank redirect chain, the browser sends an opaque `Origin: null`
// (or a gateway subdomain) that the allowlist rejects. These are top-level
// navigations that only issue a redirect — the response is never read by JS —
// so CORS enforcement here is unnecessary and would break the return flow.
const GATEWAY_CALLBACK_PATHS = new Set([
  "/api/payments/success",
  "/api/payments/fail",
  "/api/payments/cancel",
  "/api/payments/ipn",
]);

app.use(
  cors((req, done) =>
    done(null, {
      origin(origin, cb) {
        // Allow same-origin / non-browser requests (no Origin header) and the
        // payment gateway callbacks. Everything else must be explicitly
        // allowlisted or match the request's own host.
        if (GATEWAY_CALLBACK_PATHS.has(req.path) || isAllowedCorsOrigin(origin, req)) {
          return cb(null, true);
        }
        return cb(new Error("Not allowed by CORS"));
      },
      credentials: true,
      exposedHeaders: [
        "Accept-Ranges",
        "Content-Encoding",
        "Content-Length",
        "Content-Range",
      ],
    }),
  ),
);
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// JSON body parser with a `verify` callback that stashes the raw bytes on
// req.rawBody before parsing. Routes that need HMAC verification over the
// exact wire bytes (e.g. LiveKit webhooks) read req.rawBody from here. This
// is the canonical Express pattern — body-parser only reads the stream
// once, and we get both the raw bytes AND the parsed object.
app.use(
  express.json({
    limit: "16mb",
    verify: (req, _res, buf) => {
      if (buf && buf.length > 0) {
        req.rawBody = buf.toString("utf8");
      }
    },
  }),
);
app.use(express.urlencoded({ limit: "16mb", extended: true }));
app.use(passport.initialize());

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Readiness gate: DB-backed API routes must fail cleanly with 503 (instead of
// buffering/timing out) when Mongo is not connected. Liveness/health,
// readiness, and payment gateway callbacks are exempt so they can still report
// status and the gateway does not retry-storm.
const DB_EXEMPT_PREFIXES = ["/api/health", "/api/ready", "/api/payments/"];
app.use("/api", (req, res, next) => {
  if (DB_EXEMPT_PREFIXES.some((p) => req.originalUrl.startsWith(p))) return next();
  if (!connectDB.isDbReady()) {
    return res.status(503).json({
      success: false,
      message: "Service temporarily unavailable — database not ready.",
    });
  }
  next();
});

// Serve uploaded book PDFs
const uploadsDir = path.join(__dirname, "uploads");
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      // Never let the browser MIME-sniff user-uploaded content into an
      // executable/HTML context. Combined with magic-byte validation on upload,
      // this closes the "upload an image that is actually HTML/JS" vector.
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    },
  }),
);

// Global rate-limit backstop for the whole API surface. Route-level limiters
// (auth, payments, AI, forum writes) add stricter caps on top of this.
app.use("/api", globalLimiter);

// Routes
app.use("/api/landing", landingRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/contests", contestRoutes);
app.use("/api/battles", battleRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/highlights", highlightRoutes);
app.use("/api/evaluate", evaluationRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/mentor-connections", mentorRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/api/mentors", mentorRoutes);
app.use("/api/mock-tests", mockTestRoutes);
app.use("/api/live-class", liveClassRoutes);
app.use("/api/ielts", ieltsRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/admin", adminRoutes);

// --- Forum / Community routes ---
// Posts use two mounts: postComments handles nested comments under a specific
// post (/api/posts/:postId/comments), while commentRoutes handles standalone
// comment operations (edit, delete) at /api/comments/:id.
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/posts/:postId/comments", postComments);
app.use("/api/comments", commentRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api", moderationRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/study-routine", studyRoutineRoutes);

function sendHealthResponse(_req, res) {
  const dbReady = connectDB.isDbReady();
  return res.status(200).json({
    status: "ok",
    service: "topkorbo-api",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbReady ? "connected" : "not_ready",
  });
}

// Liveness — the process is up (does not assert dependencies).
app.get("/health", sendHealthResponse);
app.get("/api/health", sendHealthResponse);

// Readiness — the process can serve DB-backed traffic. Load balancers should
// route on this, not /health. Returns 503 until Mongo is connected.
app.get("/api/ready", (req, res) => {
  const ready = connectDB.isDbReady();
  let payments = false;
  try { require("sslcommerz-lts"); payments = true; } catch (_) { payments = false; }
  return res.status(ready ? 200 : 503).json({
    success: ready,
    db: ready ? "connected" : "not_ready",
    payments: payments ? "available" : "unavailable",
  });
});

// Serve the built React app when the backend hosts production assets. The
// catch-all keeps BrowserRouter routes refresh-safe, e.g. /student/find-mentor.
//
// Everything below is registered UNCONDITIONALLY and resolved per-request, so
// the order of `npm run build` vs. starting the server no longer matters. (The
// previous startup-time `fs.existsSync` guard meant that a server started
// before the client was built never registered these handlers, so every
// non-API URL 404'd on refresh — a blank white page.)
const clientDistDir = path.resolve(__dirname, "../client/dist");
const clientIndexPath = path.join(clientDistDir, "index.html");

// `express.static` no-ops per request when a file is missing, so it's safe to
// register even before the client is built — it just falls through.
app.use(express.static(clientDistDir));

app.get("*", (req, res, next) => {
  // Never swallow API / uploads routes with the SPA fallback.
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ success: false, message: "API route not found" });
  }
  if (req.path.startsWith("/uploads")) {
    return res.status(404).end();
  }
  // Serve the SPA shell if a build exists; otherwise fall through (e.g. in a
  // dev-only backend where the frontend is served by Vite on another port).
  if (fs.existsSync(clientIndexPath)) {
    return res.sendFile(clientIndexPath);
  }
  return next();
});

// Global error handler
app.use(errorHandler);

// A process that hit an uncaught exception / rejection is in an unknown, possibly
// corrupt state. Log, then shut the HTTP server so a supervisor (pm2, systemd,
// container orchestrator) can restart a clean process. Continuing to serve from
// a poisoned process risks data corruption and silent failures.
let shuttingDown = false;
function fatalShutdown(label, err) {
  console.error(`${label}:`, err && err.stack ? err.stack : err);
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (server) server.close(() => process.exit(1));
  } catch (_) {
    process.exit(1);
  }
  // Force-exit if graceful close hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("uncaughtException", (err) => fatalShutdown("UNCAUGHT EXCEPTION", err));
process.on("unhandledRejection", (reason) => fatalShutdown("UNHANDLED REJECTION", reason));

const httpServer = http.createServer(app);
initSocket(httpServer);

const server = httpServer.listen(PORT, () => {
  // Promote configured admin emails once the DB is reachable.
  setTimeout(() => bootstrapAdmin(), 1500);

  // Finalize ratings + bank contest points for any contests that have ended.
  // Runs once shortly after boot and then on a fixed interval (idempotent).
  const { settleEndedContests } = require("./services/contestSettlementService");
  const runSettlement = () =>
    settleEndedContests().catch((err) =>
      console.error("Contest settlement sweep failed:", err),
    );
  setTimeout(runSettlement, 5000);
  setInterval(runSettlement, 5 * 60 * 1000);

  // Start the periodic trending-score refresh. This applies time decay to
  // forum posts so older content naturally fades even without new engagement.
  // The trending API endpoint also triggers a throttled refresh as a fallback
  // for short-lived serverless instances where this setInterval may not run.
  const { startTrendingScoreRefresh, refreshTrendingScores } = require('./services/forumScoreService');
  setTimeout(() => refreshTrendingScores({ force: true }).catch((err) =>
    console.error('Initial forum trending-score refresh failed:', err.message)
  ), 7000);
  startTrendingScoreRefresh();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // Do NOT attempt to kill whatever owns the port — on a shared or production
    // host that could terminate an unrelated service. Fail loudly and let the
    // operator resolve the conflict.
    console.error(
      `\nFATAL: Port ${PORT} is already in use. Stop the process using it, ` +
        `or set a different PORT, then restart.`,
    );
    process.exit(1);
  } else {
    throw err;
  }
});
