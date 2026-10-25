// Pulls real, full-size icons out of executables and caches them as PNG files.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const POWERSHELL = path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT = path.join(__dirname, 'extract-icons.ps1').replace('app.asar', 'app.asar.unpacked');

const expandEnv = (p) => String(p || '').replace(/%([^%]+)%/g, (m, v) => process.env[v] || m);
const isExtractable = (p) => /\.(exe|dll|ico|icl|cpl|scr)$/i.test(p);

function cacheKey(file, index) {
  let stamp = '';
  try { stamp = String(fs.statSync(file).mtimeMs); } catch {}
  return crypto.createHash('sha1').update(`${file.toLowerCase()}|${index}|${stamp}`).digest('hex').slice(0, 24);
}

// requests: [{ id, path, index }] -> Map(id -> png file path), for the ones that worked
async function extractIcons(requests, outDir) {
  if (process.platform !== 'win32') return new Map(); // Linux apps bring their own icons
  const todo = [];
  const result = new Map();
  for (const r of requests) {
    const file = expandEnv(r.path);
    if (!isExtractable(file) || !fs.existsSync(file)) continue;
    const key = cacheKey(file, r.index || 0);
    const png = path.join(outDir, `${key}.png`);
    if (fs.existsSync(png)) { result.set(r.id, png); continue; }
    todo.push({ id: r.id, key, path: file, index: r.index || 0 });
  }
  if (!todo.length) return result;

  fs.mkdirSync(outDir, { recursive: true });
  const list = path.join(os.tmpdir(), `nexus-icons-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(list, JSON.stringify(todo.map(({ key, path: p, index }) => ({ key, path: p, index }))), 'utf8');
  const stdout = await new Promise((resolve) => {
    execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ListFile', list, '-OutDir', outDir],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 90000, encoding: 'utf8' }, (err, out) => resolve(err ? '' : out));
  });
  fs.rm(list, { force: true }, () => {});

  let map = {};
  try { map = JSON.parse(stdout.trim() || '{}'); } catch {}
  for (const t of todo) if (map[t.key] && fs.existsSync(map[t.key])) result.set(t.id, map[t.key]);
  return result;
}

module.exports = { extractIcons, expandEnv, isExtractable };
