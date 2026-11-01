// Copies the agenda's blank Excel template from the website's public/ folder
// into desktop/public/, so the two apps can never ship different templates.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(desktop, 'public', 'agenda');

rmSync(target, { recursive: true, force: true });
cpSync(join(desktop, '..', 'public', 'agenda'), target, { recursive: true });
console.log('Copied the agenda template into desktop/public/agenda');
