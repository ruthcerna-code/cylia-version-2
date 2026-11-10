import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const pub = path.resolve('public');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('No está dist/index.html. La vista previa de Vercel no tiene la aplicación.');
}
for (const entry of fs.readdirSync(dist)) {
  if (entry === 'server.cjs' || entry === 'server.cjs.map') continue;
  fs.cpSync(path.join(dist, entry), path.join(pub, entry), { recursive: true });
}
