const MAX_POINTS = 400;
const TRAILS_PER_LOAD = 5;
const MAX_TRAILS = 500; // ANYTHING AFTER THIS NUMBER WILL BE DELETED
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 day expiry on cursors because fuck you

function hueFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  //return hash % 360;
  return (hash % 100) + 180; // these tones are kinda cooler and what i want
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const onRequestGet = async ({ env }) => {
  if (!env.CURSORS) {
    return new Response(JSON.stringify({ error: "CURSORS KV binding not found" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const list = await env.CURSORS.list({ prefix: "session:" });
  const chosen = shuffle(list.keys.map((k) => k.name)).slice(0, TRAILS_PER_LOAD);
  const values = await Promise.all(chosen.map((k) => env.CURSORS.get(k)));
  const trails = values.filter(Boolean).map((v) => JSON.parse(v));

  return new Response(JSON.stringify(trails), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.CURSORS) {
    return new Response(JSON.stringify({ error: "CURSORS KV binding not found" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!Array.isArray(body.points) || body.points.length < 2) {
    return new Response(null, { status: 204 });
  }

  const points = body.points.slice(-MAX_POINTS).map((p) => [
    Math.max(0, Math.min(1, Number(p[0]) || 0)),
    Math.max(0, Math.min(1, Number(p[1]) || 0)),
    Math.max(0, Number(p[2]) || 0),
  ]);

  const id = crypto.randomUUID();
  const key = `session:${Date.now()}-${id}`;

  await env.CURSORS.put(
    key,
    JSON.stringify({ id, points, hue: hueFromId(id) }),
    { expirationTtl: TTL_SECONDS }
  );

  // read back what's written in return request 
  // to rule out any X-request local KV bs
  const readBack = await env.CURSORS.get(key);
  const list = await env.CURSORS.list({ prefix: "session:" });

  return new Response(
    JSON.stringify({
      stored_key: key,
      read_back_ok: !!readBack,
      total_keys_now: list.keys.length,
      all_keys: list.keys.map((k) => k.name),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};