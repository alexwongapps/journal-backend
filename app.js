import "dotenv/config";
import express from "express";
import { createUserSupabaseClient, noAuthClient } from "./supabaseClient.js";

const app = express();
app.use(express.json());

// middleware to verify user tokens
async function requireUser(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });

  const {
    data: { user },
    error
  } = await noAuthClient.auth.getUser(token);

  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  req.user = user;
  req.supabase = createUserSupabaseClient(token);
  next();
}

app.post("/entries", requireUser, async (req, res) => {
  const entry = req.body;

  const { error } = await req.supabase.functions.invoke("insert_entry", {
    body: entry
  });

  if (error) return res.status(400).json({ error });
  res.json({ success: true });
});

app.put("/entries/:id", requireUser, async (req, res) => {
  const entry = req.body;

  const { error } = await req.supabase.functions.invoke("update_entry", {
    body: entry
  });

  if (error) return res.status(400).json({ error });
  res.json({ success: true });
});

app.get("/entries", requireUser, async (req, res) => {
  const { data, error } = await req.supabase.functions.invoke("get_entries");

  if (error) return res.status(400).json({ error });
  res.json(data);
});

app.delete("/entries/:id", requireUser, async (req, res) => {
  const { error } = await req.supabase
    .from("entries")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error });
  res.json({ success: true });
});

app.get("/profile", requireUser, async (req, res) => {
  const uid = req.user.id;

  const { data, error } = await req.supabase
    .from("profiles")
    .select()
    .eq("id", uid)
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

app.post("/profile", requireUser, async (req, res) => {
  const { name } = req.body;

  const { error } = await req.supabase
    .from("profiles")
    .upsert({ id: req.user.id, name });

  if (error) return res.status(400).json({ error });
  res.json({ success: true });
});

app.post("/user/delete", requireUser, async (req, res) => {
  const { error } = await req.supabase.rpc("mark_user_deleted", {
    uid: req.user.id
  });

  if (error) return res.status(400).json({ error });
  res.json({ success: true });
});

// categories, icons, and prompts
app.get("/categories", async (_, res) => {
  const { data: categories } = await noAuthClient.from("categories").select();
  const { data: subs } = await noAuthClient.from("subcategories").select();

  const subsByParent = subs.reduce((acc, s) => {
    acc[s.parent] = acc[s.parent] ?? [];
    acc[s.parent].push(s);
    return acc;
  }, {});

  res.json(
    categories.map(c => ({
      ...c,
      subcategories: subsByParent[c.id] ?? []
    }))
  );
});

app.get("/icons", async (_, res) => {
  const { data: rows } = await noAuthClient.from("icons").select();

  const base = rows.find(r => r.user_id === null)?.emojis ?? [];
  const unique = [...new Set([...base])];

  res.json(unique);
});

app.get("/prompts", async (_, res) => {
  const { data } = await noAuthClient.from("prompts").select();
  res.json(data);
});

export default app;
