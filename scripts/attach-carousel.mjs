// Joint automatiquement le PDF d'un carrousel au brouillon Typefully préparé par Nora.
// Déclenché par .github/workflows/attach-carousel.yml à chaque dépôt de carrousels/<slug>/typefully.json.
// Le brouillon reste « planned » (inerte) : la publication n'a lieu qu'après validation du fondateur.
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.TYPEFULLY_API_KEY;
const API = "https://api.typefully.com/v2";
if (!KEY) { console.error("Secret TYPEFULLY_API_KEY absent : ajoute-le dans Settings → Secrets and variables → Actions."); process.exit(1); }

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

const SAFE_NAME = /^[a-zA-Z0-9_.()\-]+\.pdf$/;
const root = "carrousels";
const dirs = fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, "typefully.json"))) : [];
let failures = 0, done = 0;

for (const dir of dirs) {
  const markerPath = path.join(dir, "typefully-attached.json");
  if (fs.existsSync(markerPath)) continue; // déjà traité
  const m = JSON.parse(fs.readFileSync(path.join(dir, "typefully.json"), "utf8"));
  const set = Number(m.social_set_id), draftId = Number(m.draft_id);
  const pdfPath = path.join(dir, m.pdf || "carrousel.pdf");
  const fileName = m.file_name || path.basename(pdfPath);
  try {
    if (!set || !draftId) throw new Error("typefully.json doit contenir social_set_id et draft_id");
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF introuvable : ${pdfPath}`);
    if (!SAFE_NAME.test(fileName)) throw new Error(`Nom de fichier refusé par Typefully : ${fileName}`);

    // 1. Le brouillon doit être encore modifiable (brouillon ou planifié, jamais programmé ou publié)
    const draft = await api("GET", `/social-sets/${set}/drafts/${draftId}`);
    if (!["draft", "planned"].includes(draft.status)) {
      fs.writeFileSync(markerPath, JSON.stringify({ skipped: true, reason: `statut ${draft.status}`, at: new Date().toISOString() }, null, 1));
      console.log(`${dir} : ignoré (brouillon ${draft.status})`);
      continue;
    }
    const li = draft.platforms && draft.platforms.linkedin;
    if (!li || !Array.isArray(li.posts) || !li.posts.length) throw new Error("le brouillon n'a pas de post LinkedIn");

    // 2. Téléversement du PDF (PUT brut sur l'URL présignée, sans en-têtes)
    const up = await api("POST", `/social-sets/${set}/media/upload`, { file_name: fileName, alt_text: (m.alt_text || "").slice(0, 1000) || undefined });
    const bytes = fs.readFileSync(pdfPath);
    const put = await fetch(up.upload_url, { method: "PUT", body: bytes });
    if (!put.ok) throw new Error(`envoi du PDF refusé : ${put.status} ${(await put.text()).slice(0, 200)}`);

    // 3. Attente du traitement
    let status = "processing";
    for (let i = 0; i < 40 && status === "processing"; i++) {
      await sleep(3000);
      const media = await api("GET", `/social-sets/${set}/media/${up.media_id}`);
      status = media.status || (media.ready ? "ready" : "processing");
    }
    if (status !== "ready") throw new Error(`traitement du PDF : ${status}`);

    // 4. Rattachement au premier post LinkedIn, texte et premier commentaire conservés tels quels
    const posts = li.posts.map((p, i) => {
      const keep = { text: p.text };
      if (p.hide_link_preview != null) keep.hide_link_preview = p.hide_link_preview;
      keep.media_ids = i === 0 ? [up.media_id] : (p.media_ids || []).map((x) => (typeof x === "string" ? x : x.media_id || x.id)).filter(Boolean);
      return keep;
    });
    const linkedin = { enabled: true, posts };
    if (li.settings && li.settings.first_comment) linkedin.settings = { first_comment: li.settings.first_comment };
    await api("PATCH", `/social-sets/${set}/drafts/${draftId}`, { platforms: { linkedin } });

    // 5. Vérification
    const after = await api("GET", `/social-sets/${set}/drafts/${draftId}`);
    const p0 = after.platforms.linkedin.posts[0];
    const ids = (p0.media_ids || p0.media || []).map((x) => (typeof x === "string" ? x : x.media_id || x.id));
    if (!ids.includes(up.media_id)) throw new Error("le PDF n'apparaît pas sur le brouillon après mise à jour");
    if (after.status !== draft.status) throw new Error(`statut modifié de ${draft.status} à ${after.status} : vérifie le brouillon`);

    fs.writeFileSync(markerPath, JSON.stringify({ media_id: up.media_id, file_name: fileName, draft_status: after.status, at: new Date().toISOString() }, null, 1));
    console.log(`${dir} : PDF joint au brouillon ${draftId} (${after.status})`);
    done++;
  } catch (e) {
    failures++;
    console.error(`${dir} : ÉCHEC — ${e.message}`);
  }
}
console.log(`Terminé : ${done} carrousel(s) joint(s), ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
