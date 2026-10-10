// Short-lived relay credentials for players whose routers block direct peer connections.
// Without the two secrets this returns an empty list and the game keeps its default servers.
export async function turn({ env }) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return { iceServers: [] };
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.TURN_KEY_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 14400 }),
    });
    if (!r.ok) return { iceServers: [] };
    const j = await r.json();
    return { iceServers: Array.isArray(j.iceServers) ? j.iceServers : [] };
  } catch { return { iceServers: [] }; }
}
