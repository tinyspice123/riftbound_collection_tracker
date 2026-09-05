import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'public');
const types = new Map([['.css','text/css'],['.html','text/html'],['.js','text/javascript'],['.json','application/json'],['.csv','text/csv'],['.webp','image/webp'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.png','image/png']]);
createServer(async (request,response) => {
  try {
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
    const file=path.resolve(root,relative);
    if(file!==root&&!file.startsWith(root+path.sep)) throw new Error('Invalid path');
    const body=await readFile(file);
    response.writeHead(200,{'Content-Type':types.get(path.extname(file))||'application/octet-stream'});
    response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}).listen(4173,'127.0.0.1');
