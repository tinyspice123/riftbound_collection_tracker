import fs from 'node:fs';
import vm from 'node:vm';

const required = ['index.html','tracker.html','index.js','tracker.js','lib.js','sets.js','sw.js','manifest.json'];
for (const file of required) {
  if (!fs.existsSync(`public/${file}`)) throw new Error(`Missing public/${file}`);
}

const source = fs.readFileSync('public/sets.js', 'utf8');
const context = {};
vm.runInNewContext(`${source}; globalThis.registry = SETS`, context);
const expected = {origins:'OGN', spiritforged:'SFD', unleashed:'UNL', vendetta:'VEN'};
for (const [id, code] of Object.entries(expected)) {
  const set = context.registry[id];
  if (!set) throw new Error(`${id} is missing from the registry`);
  if (set.code !== code) throw new Error(`${id} has the wrong set code`);
  if (!/^\d+$/.test(set.sheetGid)) throw new Error(`${id} has no numeric sheet gid`);
  if (!set.sheet?.includes(`gid=${set.sheetGid}&single=true&output=csv`)) {
    throw new Error(`${id} is not connected to its published CSV tab`);
  }
  if (!fs.existsSync(`public/data/${id}.csv`)) throw new Error(`${id} fallback CSV is missing`);
}

const combined = required.map(file => fs.readFileSync(`public/${file}`, 'utf8')).join('\n');
if (/Pokemon Card Tracker|ultimate_pokemon_card_tracker|pokemontcg\.io/i.test(combined)) {
  throw new Error('Pokémon tracker branding or services remain in runtime files');
}

const backupWorkflow = fs.readFileSync('.github/workflows/backup.yml', 'utf8');
for (const policy of [
  'cron: "0 9 * * *"',
  'contents: write',
  'python scripts/backup_sheets.py',
  'git add backups/ public/data/',
  'gh workflow run ci-quality-deploy.yml --ref main',
]) {
  if (!backupWorkflow.includes(policy)) throw new Error(`Backup workflow is missing: ${policy}`);
}
console.log('Riftbound static-site checks passed');
