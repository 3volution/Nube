import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Archivo de almacenamiento en el servidor
const LOG_FILE = join(process.cwd(), 'data', 'access-log.json');

// Crear directorio si no existe
async function ensureDir() {
  try {
    await import('fs').then(fs => fs.promises.mkdir(join(process.cwd(), 'data'), { recursive: true }));
  } catch (err) {
    // Ya existe o error ignorable
  }
}

// GET: obtener todos los accesos
async function GET(req) {
  try {
    await ensureDir();
    const data = await readFile(LOG_FILE, 'utf-8');
    const logs = JSON.parse(data || '[]');
    return Response.json({ logs });
  } catch (err) {
    // Si el archivo no existe, devolver array vacío
    return Response.json({ logs: [] });
  }
}

// POST: registrar un nuevo acceso
async function POST(req) {
  try {
    await ensureDir();
    
    const { password, status } = await req.json();
    
    // Leer logs existentes
    let logs = [];
    try {
      const data = await readFile(LOG_FILE, 'utf-8');
      logs = JSON.parse(data || '[]');
    } catch (err) {
      logs = [];
    }
    
    // Agregar nuevo acceso
    logs.push({
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleString('es-ES'),
      password: password || 'desconocida',
      status: status || 'unknown'
    });
    
    // Guardar
    await writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
    
    return Response.json({ success: true, logs });
  } catch (err) {
    console.error('[v0] Error en access-log:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export { GET, POST };
