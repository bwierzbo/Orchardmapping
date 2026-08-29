import { config } from 'dotenv';
config({ path: '.env.local' });

import { getOrchardConfigById } from '../lib/db/orchards';

async function checkConfig() {
  const config = await getOrchardConfigById('washington');
  console.log('Washington orchard config:');
  console.log(JSON.stringify(config, null, 2));
}

checkConfig().catch(console.error);
