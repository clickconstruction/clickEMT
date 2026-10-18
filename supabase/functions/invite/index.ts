// Invite by email (v56): the Incident Map's first server code. Called by the base with the caller's session:
//   POST /functions/v1/invite  { incident, invites: [{ email, role, unit }] }   — send invitations
//   POST /functions/v1/invite  { incident, resend: <invite id> }                — send one again (a new link)
// It checks the caller is Operations of that incident, writes the ic_invites row (the database's trigger logs it),
// makes the account or a sign-in link through Supabase Auth's admin API (an invite link for a new address, a magic
// link for an account that exists; neither needs sign-ups to be open), and sends one email with one link through
// Resend, the project's mail sender, in the Incident Map's own words. The service role key lives here and nowhere
// else. Secrets it reads: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (given to every function),
// RESEND_API_KEY and RESEND_DEFAULT_FROM (the project's), APP_URL (https://clickemt.com; the link's host).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') || 'https://clickemt.com').replace(/\/+$/, '');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Invite = { email: string; role: 'unit' | 'ops'; unit?: string };

// the link's landing: the field app for a unit, the base for Operations, with the token in the address
function landing(role: string, token: string) { return `${APP_URL}/${role === 'ops' ? '' : 'field/'}?invite=${encodeURIComponent(token)}`; }

// the sender: the Incident Map's name on the project's verified address
function fromAddress() {
  const def = Deno.env.get('RESEND_DEFAULT_FROM') || '';
  const m = /<([^>]+)>/.exec(def);
  const addr = (m ? m[1] : def).trim();
  return addr ? `Incident Map <${addr}>` : 'Incident Map <onboarding@resend.dev>';
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('no mail sender is set up (RESEND_API_KEY)');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: fromAddress(), to: [to], subject, text, html }) });
  if (!r.ok) { const body = await r.text().catch(() => ''); throw new Error(`the mail sender refused (${r.status}): ${body.slice(0, 200)}`); }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function words(incident: string, role: string, unit: string, by: string, link: string) {
  const as = role === 'ops' ? 'Operations' : unit ? `a unit, ${unit}` : 'a unit';
  const subject = `You're invited to ${incident}`;
  const text = `${by} invited you to ${incident} on the Incident Map, as ${as}.\n\nOpen this link to join (it works for seven days, once):\n${link}\n\n${role === 'ops' ? 'It opens the base on a laptop.' : 'It opens the field app on your phone.'} You set a password the first time, then your name and phone, and you are in with no code to type.\n\nIf you were not expecting this, ignore it: nothing happens until the link is opened.`;
  const html = `<p>${esc(by)} invited you to <strong>${esc(incident)}</strong> on the Incident Map, as <strong>${esc(as)}</strong>.</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;background:#2F6FB7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Join ${esc(incident)}</a></p><p style="color:#555;font-size:13px">The link works for seven days, once. ${role === 'ops' ? 'It opens the base on a laptop.' : 'It opens the field app on your phone.'} You set a password the first time, then your name and phone, and you are in with no code to type.</p><p style="color:#777;font-size:12px">If you were not expecting this, ignore it: nothing happens until the link is opened.</p>`;
  return { subject, text, html };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401);
  // who is calling, by their own session
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: 'not signed in' }, 401);
  const caller = who.user;
  let body: { incident?: string; invites?: Invite[]; resend?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'say what to send' }, 400); }
  const incidentId = String(body.incident || '');
  if (!incidentId) return json({ error: 'say which incident' }, 400);
  // the service role: only after the caller is known to be Operations of this incident
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: m } = await admin.from('ic_members').select('role, removed_at').eq('incident_id', incidentId).eq('user_id', caller.id).maybeSingle();
  if (!m || m.role !== 'ops' || m.removed_at) return json({ error: 'Only Operations of the incident invites people' }, 403);
  const { data: inc } = await admin.from('ic_incidents').select('id, name, status, lead_agency').eq('id', incidentId).single();
  if (!inc || inc.status !== 'active') return json({ error: 'That incident is closed' }, 400);
  const { data: prof } = await admin.from('ic_profiles').select('full_name').eq('user_id', caller.id).maybeSingle();
  const by = (prof?.full_name || '').trim() || 'Operations';

  // the rows: the caller's own session writes them, so RLS and the trigger judge the caller, not the service role
  const results: { email: string; ok: boolean; id?: string; error?: string }[] = [];
  const rows: { id: string; email: string; role: string; unit_name: string; token: string }[] = [];
  if (body.resend) {
    const { data: v, error } = await asCaller.from('ic_invites').select('id, email, role, unit_name, token, withdrawn_at, accepted_at').eq('id', body.resend).eq('incident_id', incidentId).maybeSingle();
    if (error || !v) return json({ error: 'That invitation is not on record' }, 404);
    if (v.withdrawn_at) return json({ error: 'That invitation was withdrawn; send a new one' }, 400);
    if (v.accepted_at) return json({ error: 'That invitation was accepted already' }, 400);
    rows.push(v);
  } else {
    for (const i of Array.isArray(body.invites) ? body.invites : []) {
      const email = String(i.email || '').trim().toLowerCase(), role = i.role === 'ops' ? 'ops' : 'unit', unit = String(i.unit || '').trim().slice(0, 60);
      const { data: v, error } = await asCaller.from('ic_invites').insert({ incident_id: incidentId, email, role, unit_name: unit }).select('id, email, role, unit_name, token').single();
      if (error || !v) { results.push({ email, ok: false, error: error?.message || 'could not be made' }); continue; }
      rows.push(v);
    }
  }
  for (const v of rows) {
    try {
      // a new token on every send: an old link stops working
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const redirectTo = landing(v.role, token);
      // the account: an invite link makes it for a new address (sign-ups need not be open); a magic link for one that exists
      let link = '', userId: string | null = null;
      const inv = await admin.auth.admin.generateLink({ type: 'invite', email: v.email, options: { redirectTo } });
      if (!inv.error && inv.data?.properties?.action_link) { link = inv.data.properties.action_link; userId = inv.data.user?.id || null; }
      else {
        const mag = await admin.auth.admin.generateLink({ type: 'magiclink', email: v.email, options: { redirectTo } });
        if (mag.error || !mag.data?.properties?.action_link) throw new Error(mag.error?.message || inv.error?.message || 'no link could be made');
        link = mag.data.properties.action_link; userId = mag.data.user?.id || null;
      }
      const w = words(inc.name, v.role, v.unit_name, by, link);
      await sendEmail(v.email, w.subject, w.text, w.html);
      const { error: upErr } = await asCaller.from('ic_invites').update({ token, sent_at: new Date().toISOString(), last_error: '' }).eq('id', v.id);
      if (upErr) throw new Error(upErr.message);
      if (userId) await admin.from('ic_invites').update({ user_id: userId }).eq('id', v.id);
      results.push({ email: v.email, ok: true, id: v.id });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      await asCaller.from('ic_invites').update({ last_error: msg.slice(0, 200) }).eq('id', v.id);
      results.push({ email: v.email, ok: false, id: v.id, error: msg });
    }
  }
  return json({ results });
});
