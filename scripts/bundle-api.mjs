import { build } from 'esbuild';

await build({
  stdin: {
    contents: "import app from './server.ts';\nexport default app;\n",
    resolveDir: process.cwd(),
    sourcefile: 'vercel-api-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'api/index.js',
  logLevel: 'info',
});
