// Asks GitHub whether a newer Nexus release exists. Nothing is downloaded or installed; the user opens the release page.
const pkg = require('../package.json');

// "owner/name", a github.com URL, or a package.json repository object
function repoSlug() {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url;
  const m = String(r || '').match(/(?:github\.com[/:]|^github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

const parts = (v) => String(v).replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
function isNewer(latest, current) {
  const a = parts(latest), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Resolves { configured, latest, url, newer, installer }. Never rejects: offline, rate limits and missing releases all give newer: false.
async function check(current, slug = repoSlug()) {
  if (!slug) return { configured: false, newer: false };
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Nexus-launcher' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { configured: true, newer: false, error: res.status };
    const rel = await res.json();
    if (!rel.tag_name || rel.draft || rel.prerelease) return { configured: true, newer: false };
    // The Windows installer attached to the release (what "Update now" downloads). GitHub also gives its SHA-256 when it has one.
    const asset = (rel.assets || []).find((a) => /setup.*\.exe$/i.test(a.name) && a.browser_download_url);
    return {
      configured: true, latest: rel.tag_name.replace(/^v/i, ''), url: rel.html_url, newer: isNewer(rel.tag_name, current),
      installer: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size, sha256: /^sha256:([0-9a-f]{64})$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null } : null,
    };
  } catch (e) {
    return { configured: true, newer: false, error: String(e && e.message || e) };
  }
}

module.exports = { check, isNewer, repoSlug };
