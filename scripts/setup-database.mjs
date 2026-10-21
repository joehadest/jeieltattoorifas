import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// DATABASE_URL is never imported into the Vite application or printed.
let connection = process.env.DATABASE_URL;
if (process.argv.includes('--stdin')) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  console.log('Aguardando DATABASE_URL via stdin. O conteúdo não será exibido.');
  connection = await new Promise((resolve, reject) => {
    let value = '';
    const input = chunk => {
      value += chunk.toString();
      if (value.includes('\u0003')) { process.stdin.pause(); reject(new Error('Input cancelled')); return; }
      if (/[\r\n]/.test(value)) {
        process.stdin.off('data', input);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(value.split(/[\r\n]/)[0].trim());
      }
    };
    process.stdin.on('data', input);
    process.stdin.once('end', () => resolve(value.trim()));
  });
}
if (!connection) {
  console.error('Configure DATABASE_URL em .env.local e execute npm run db:setup.');
  process.exit(1);
}
const sql = postgres(connection, { ssl: { rejectUnauthorized: true }, connect_timeout: 10, max: 1, onnotice: () => {} });
try {
  // Refuse to overwrite or partially migrate an already initialized project.
  const [existing] = await sql`select to_regclass('public.campaigns') as campaigns, to_regclass('public.orders') as orders`;
  if (existing.campaigns || existing.orders) throw Object.assign(new Error('Schema already exists'), { code: 'SCHEMA_EXISTS' });
  const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await sql.unsafe(await readFile(`${directory}/${filename}`, 'utf8'));
  }
  console.log('Esquema criado. Cadastre o administrador conforme README.md. Nenhum prêmio foi publicado.');
} catch (error) {
  // Driver messages can contain connection details; output only a safe error code.
  console.error(`Não foi possível preparar o banco. Código: ${String(error.code || 'CONNECTION_ERROR').replace(/[^A-Z0-9_]/g, '')}.`);
  process.exitCode = 1;
} finally { await sql.end({ timeout: 3 }); }
