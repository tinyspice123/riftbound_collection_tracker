import fs from 'node:fs';
import vm from 'node:vm';

const required = ['index.html','tracker.html','index.js','tracker.js','lib.js','sets.js','sw.js','manifest.json','supabase-config.js','supabase-client.js'];
for (const file of required) {
  if (!fs.existsSync(`public/${file}`)) throw new Error(`Missing public/${file}`);
}

const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
for (const icon of [
  ['assets/icon-192.png', '192x192', 'any'],
  ['assets/icon-512.png', '512x512', 'any'],
  ['assets/icon-maskable-512.png', '512x512', 'maskable'],
]) {
  const [src, sizes, purpose] = icon;
  if (!manifest.icons?.some(item => item.src === src && item.sizes === sizes && item.purpose === purpose)) {
    throw new Error(`Manifest icon is missing or misconfigured: ${src}`);
  }
  if (!fs.existsSync(`public/${src}`)) throw new Error(`PWA icon is missing: ${src}`);
}

const source = fs.readFileSync('public/sets.js', 'utf8');
const context = {};
vm.runInNewContext(`${source}; globalThis.registry = SETS`, context);
const expected = {origins:'OGN', spiritforged:'SFD', unleashed:'UNL', vendetta:'VEN'};
for (const [id, code] of Object.entries(expected)) {
  const set = context.registry[id];
  if (!set) throw new Error(`${id} is missing from the registry`);
  if (set.code !== code) throw new Error(`${id} has the wrong set code`);
  if ('sheetGid' in set || 'sheet' in set) throw new Error(`${id} still has Google Sheets configuration`);
  if (!fs.existsSync(`backups/${id}.csv`)) throw new Error(`${id} backup CSV is missing`);
  const logoPath = `public/assets/logos/${id}.png`;
  if (!fs.existsSync(logoPath)) throw new Error(`${id} logo is missing`);
  const logoSignature = fs.readFileSync(logoPath).subarray(0, 8).toString('hex');
  if (logoSignature !== '89504e470d0a1a0a') throw new Error(`${id} logo is not a valid PNG`);
}

const combined = required.map(file => fs.readFileSync(`public/${file}`, 'utf8')).join('\n');
if (/Pokemon Card Tracker|ultimate_pokemon_card_tracker|pokemontcg\.io/i.test(combined)) {
  throw new Error('Pokémon tracker branding or services remain in runtime files');
}
if (/docs\.google\.com|googleusercontent\.com/.test(combined)) {
  throw new Error('Google Sheets endpoints remain in runtime files');
}
if (!combined.includes('riftbound_card_main') || !combined.includes('riftbound-tracker:supabase-session')) {
  throw new Error('Supabase Riftbound client configuration is incomplete');
}

const backupWorkflow = fs.readFileSync('.github/workflows/backup.yml', 'utf8');
for (const policy of [
  'cron: "0 9 * * *"',
  'contents: write',
  'python scripts/backup_supabase.py',
  'git add backups/',
  'gh workflow run ci-quality-deploy.yml --ref main',
]) {
  if (!backupWorkflow.includes(policy)) throw new Error(`Backup workflow is missing: ${policy}`);
}
console.log('Riftbound static-site checks passed');
