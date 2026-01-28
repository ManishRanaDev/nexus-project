import fs from 'fs';
import path from 'path';
import { config } from './config.js';

let mediaCounter = 0;

if (!fs.existsSync(config.mediaDir)) {
  fs.mkdirSync(config.mediaDir, { recursive: true });
}

export function safeFilename(ext = 'bin'): string {
  mediaCounter = (mediaCounter + 1) % 10000;
  return `media_${Date.now()}_${mediaCounter}.${ext}`;
}

export function saveMedia(buffer: Buffer, mimetype: string): string {
  const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin';
  const filename = safeFilename(ext);
  const filePath = path.join(config.mediaDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `${config.publicUrl}/media/${filename}`;
}

export function cleanupOldMedia(): number {
  let deleted = 0;
  try {
    const files = fs.readdirSync(config.mediaDir);
    const now = Date.now();

    for (const file of files) {
      try {
        const filePath = path.join(config.mediaDir, file);
        const stats = fs.statSync(filePath);
        const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays > config.mediaMaxAgeDays) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {
        // skip files we can't stat/delete
      }
    }
  } catch {
    // skip if directory doesn't exist
  }
  return deleted;
}
