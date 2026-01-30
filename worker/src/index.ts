import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// SPA fallback — serve index.html for all non-API routes
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
});

export default app;
