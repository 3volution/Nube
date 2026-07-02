import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'access-log.json');

function ensureFile() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ logs: [] }), 'utf8');
  }
}

function readLogs() {
  ensureFile();
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { logs: [] };
  }
}

function writeLogs(data) {
  ensureFile();
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  const data = readLogs();
  // Devolver ordenado más reciente primero
  const logs = [...data.logs].reverse();
  return NextResponse.json({ logs });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { password, status } = body;

    console.log('[v0-DEBUG] POST /api/access-log iniciado');
    console.log('[v0-DEBUG] Fecha:', new Date().toISOString());
    console.log('[v0-DEBUG] Password recibido:', password);
    console.log('[v0-DEBUG] Status recibido:', status);
    console.log('[v0-DEBUG] Ruta del archivo:', LOG_FILE);

    const data = readLogs();

    data.logs.push({
      password: password || '',
      status: status || 'failed',
      date: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
      timestamp: new Date().toISOString()
    });

    console.log('[v0-DEBUG] Intentando escribir en:', LOG_FILE);
    writeLogs(data);
    console.log('[v0-DEBUG] Escritura exitosa. Total registros:', data.logs.length);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.log('[v0-DEBUG] ERROR en POST:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
