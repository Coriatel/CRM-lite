#!/usr/bin/env node
/**
 * One-time script: Import all named contacts into a project.
 *
 * Usage:
 *   node scripts/import-contacts-to-project.js [--dry-run]
 */

const DIRECTUS_URL = 'https://crm.merkazneshama.co.il';
const TOKEN = 'hycrm-admin-api-token-2026';
const PROJECT_ID = 'cad4af6a-18bb-4bb2-bd3c-61a5ef0c9573';
const BATCH_SIZE = 100;

async function directusFetch(path, options = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Directus ${res.status}: ${body}`);
  }
  return res.json();
}

function isRealName(name) {
  if (!name || name.length <= 2) return false;
  // Phone numbers as names
  if (/^\+?[0-9][0-9\s\-()]+$/.test(name)) return false;
  // Placeholder patterns
  if (name.startsWith('_no_phone_')) return false;
  // Dots, underscores, dashes only
  if (/^[._\-\s]+$/.test(name)) return false;
  return true;
}

async function getAllContacts() {
  const all = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await directusFetch(
      `/items/contacts?fields=id,full_name&sort=id&limit=${limit}&offset=${offset}`
    );
    all.push(...res.data);
    if (res.data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function getExistingProjectContactIds() {
  const all = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await directusFetch(
      `/items/project_contacts?filter[project_id][_eq]=${PROJECT_ID}&fields=contact_id&limit=${limit}&offset=${offset}`
    );
    all.push(...res.data.map(d => d.contact_id));
    if (res.data.length < limit) break;
    offset += limit;
  }
  return new Set(all);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN ===\n');

  console.log('Fetching all contacts...');
  const contacts = await getAllContacts();
  console.log(`Total contacts in Directus: ${contacts.length}`);

  const named = contacts.filter(c => isRealName(c.full_name));
  console.log(`Contacts with real names: ${named.length}`);
  console.log(`Filtered out: ${contacts.length - named.length}`);

  console.log('\nFetching existing project contacts...');
  const existing = await getExistingProjectContactIds();
  console.log(`Already in project: ${existing.size}`);

  const toAdd = named.filter(c => !existing.has(c.id));
  console.log(`New contacts to add: ${toAdd.length}`);

  if (toAdd.length === 0) {
    console.log('\nNothing to do!');
    return;
  }

  if (dryRun) {
    console.log('\nFirst 10 contacts that would be added:');
    toAdd.slice(0, 10).forEach(c => console.log(`  - ${c.full_name} (${c.id})`));
    console.log('\n=== DRY RUN COMPLETE ===');
    return;
  }

  console.log(`\nAdding ${toAdd.length} contacts in batches of ${BATCH_SIZE}...`);
  let added = 0;
  for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
    const batch = toAdd.slice(i, i + BATCH_SIZE);
    const items = batch.map(c => ({
      project_id: PROJECT_ID,
      contact_id: c.id,
      campaign_status: 'not_contacted',
    }));
    await directusFetch('/items/project_contacts', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    added += batch.length;
    console.log(`  Added ${added}/${toAdd.length}`);
  }

  console.log(`\nDone! ${added} contacts added to project.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
