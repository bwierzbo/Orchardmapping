/**
 * Upload a preview image for an orchard and point preview_image_url at it.
 * Usage: npx tsx scripts/set-preview.ts <orchard-id> <image-path>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs/promises';
import { uploadPreviewImageToBlob } from '../lib/blob/upload';
import { updateOrchard } from '../lib/db/orchards';

async function main() {
  const [id, file, filename = 'card.jpg'] = process.argv.slice(2);
  if (!id || !file) {
    console.error('Usage: tsx scripts/set-preview.ts <orchard-id> <image-path> [filename]');
    process.exit(1);
  }
  const buffer = await fs.readFile(file);
  const result = await uploadPreviewImageToBlob(id, buffer, filename);
  console.log('uploaded:', result.url);
  const updated = await updateOrchard(id, { preview_image_url: result.url });
  if (!updated) {
    console.error(`No orchard '${id}'`);
    process.exit(1);
  }
  console.log(`set preview_image_url for ${id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
