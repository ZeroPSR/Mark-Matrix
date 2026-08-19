import { Hono } from "hono";
import { API_ROUTES } from "@mark-matrix/shared";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/*", supabaseAuth);
app.get(API_ROUTES.me, (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));

app.use("/api/admin/*", requireRole("admin"));
app.route(API_ROUTES.adminUsers, adminUsersRoute);

export default app;
