// Joint l'image carrée d'un post LinkedIn à son brouillon Typefully EXISTANT.
// Déclenché par .github/workflows/attach-post-image.yml à chaque dépôt de posts/<date>-<slug>/typefully.json.
// Garde-fous anti-doublon :
//  - ne crée JAMAIS de brouillon : il ne fait qu'ajouter media_ids au brouillon indiqué ;
//  - ne fait rien si le post est publié, en cours de publication, part dans moins de 20 minutes,
//    ou porte déjà une image (media_ids non vide) ;
//  - écrit image-attached.json après traitement : un dossier n'est jamais traité deux fois ;
//  - vérifie après coup que le texte, la date et le statut du brouillon n'ont pas changé.
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.TYPEFULLY_API_KEY;
const API = "https://api.typefully.com/v2";
if (!KEY) { console.error("::error::Secret TYPEFULLY_API_KEY absent."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${typeof json === "string" ? json.slice(0, 300) : JSON.stringify(json).slice(0, 300)}`);
  return json;
}
const idsOf = (p) => (p.media_ids || p.media || []).map((x) => (typeof x === "string" ? x : x.media_id || x.id)).filter(Boolean);

const SAFE_NAME = /^[a-zA-Z0-9_.()\-]+\.(png|jpe?g)$/i;
const root = "posts";
const dirs = fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, "typefully.json"))) : [];
let failures = 0, done = 0;

for (const dir of dirs) {
  const markerPath = path.join(dir, "image-attached.json");
  if (fs.existsSync(markerPath)) continue; // déjà traité
  const mark = (o) => fs.writeFileSync(markerPath, JSON.stringify({ ...o, at: new Date().toISOString() }, null, 1));
  const m = JSON.parse(fs.readFileSync(path.join(dir, "typefully.json"), "utf8"));
  const set = Number(m.social_set_id), draftId = Number(m.draft_id);
  const imgPath = path.join(dir, m.image || "visuel.png");
  const fileName = m.file_name || path.basename(imgPath);
  try {
    if (!set || !draftId) throw new Error("typefully.json doit contenir social_set_id et draft_id");
    if (!fs.existsSync(imgPath)) throw new Error(`image introuvable : ${imgPath}`);
    if (!SAFE_NAME.test(fileName)) throw new Error(`nom de fichier refusé : ${fileName}`);

    const draft = await api("GET", `/social-sets/${set}/drafts/${draftId}`);
    const li = draft.platforms && draft.platforms.linkedin;
    if (!li || !Array.isArray(li.posts) || !li.posts.length) throw new Error("le brouillon n'a pas de post LinkedIn");
    if (draft.published_at || ["published", "publishing", "error"].includes(draft.status)) { mark({ skipped: true, reason: `statut ${draft.status}` }); console.log(`${dir} : ignoré (${draft.status})`); continue; }
    if (idsOf(li.posts[0]).length) { mark({ skipped: true, reason: "le post a déjà une image" }); console.log(`${dir} : ignoré (image déjà jointe)`); continue; }
    const when = Date.parse(draft.scheduled_date || "");
    if (Number.isFinite(when) && when - Date.now() < 20 * 60e3) { mark({ skipped: true, reason: "publication dans moins de 20 minutes" }); console.log(`${dir} : ignoré (trop tard)`); continue; }

    const up = await api("POST", `/social-sets/${set}/media/upload`, { file_name: fileName, alt_text: (m.alt_text || "").slice(0, 1000) || undefined });
    const put = await fetch(up.upload_url, { method: "PUT", body: fs.readFileSync(imgPath) });
    if (!put.ok) throw new Error(`envoi de l'image refusé : ${put.status} ${(await put.text()).slice(0, 200)}`);

    let status = "processing";
    for (let i = 0; i < 40 && status === "processing"; i++) {
      await sleep(3000);
      const media = await api("GET", `/social-sets/${set}/media/${up.media_id}`);
      status = media.status || (media.ready ? "ready" : "processing");
    }
    if (status !== "ready") throw new Error(`traitement de l'image : ${status}`);

    const posts = li.posts.map((p, i) => {
      const keep = { text: p.text };
      if (p.hide_link_preview != null) keep.hide_link_preview = p.hide_link_preview;
      keep.media_ids = i === 0 ? [up.media_id] : idsOf(p);
      return keep;
    });
    const linkedin = { enabled: true, posts };
    if (li.settings && li.settings.first_comment) linkedin.settings = { first_comment: li.settings.first_comment };
    await api("PATCH", `/social-sets/${set}/drafts/${draftId}`, { platforms: { linkedin } });

    const after = await api("GET", `/social-sets/${set}/drafts/${draftId}`);
    const a0 = after.platforms.linkedin.posts[0];
    if (!idsOf(a0).includes(up.media_id)) throw new Error("l'image n'apparaît pas sur le brouillon après mise à jour");
    if (after.status !== draft.status) throw new Error(`statut modifié de ${draft.status} à ${after.status} : vérifie le brouillon`);
    if (after.scheduled_date !== draft.scheduled_date) throw new Error(`date modifiée : ${draft.scheduled_date} → ${after.scheduled_date}`);
    if (a0.text !== li.posts[0].text) throw new Error("texte du post modifié : vérifie le brouillon");

    mark({ media_id: up.media_id, file_name: fileName, draft_id: draftId, draft_status: after.status, scheduled_date: after.scheduled_date });
    console.log(`${dir} : image jointe au brouillon ${draftId} (${after.status}, ${after.scheduled_date})`);
    done++;
  } catch (e) {
    failures++;
    console.error(`::error::${dir} : ÉCHEC — ${e.message}`);
  }
}
console.log(`Terminé : ${done} image(s) jointe(s), ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
