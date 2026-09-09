import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
export async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const journal = JSON.parse(await readFile(new URL('../../drizzle/meta/_journal.json', import.meta.url)));
  for (const entry of journal.entries) sqlite.exec(await readFile(new URL('../../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        run() { const r = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
        async first(column) { const row = sqlite.prepare(sql).get(...values); return row ? (column ? row[column] : row) : null; },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
      };
      return statement;
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  const objects = new Map();
  const VIDEOS = {
    async put(key, value, options) { const bytes = await new Response(value).arrayBuffer(); objects.set(key, { bytes, options }); },
    async head(key) { const o=objects.get(key); return o ? {size:o.bytes.byteLength} : null; },
    async get(key) { const o=objects.get(key); return o ? {body:new Response(o.bytes).body,size:o.bytes.byteLength,httpMetadata:o.options?.httpMetadata} : null; },
    async delete(key) { objects.delete(key); },
  };
  const env = { DB, VIDEOS, ASSETS:{ fetch:async()=>new Response('Not found',{status:404}) }, INBOX_ALLOWED_EMAILS:'test@example.com', PUBLIC_BASE_URL:'https://reelvolt.test', INSTAGRAM_ACCESS_TOKEN:'test-only', INSTAGRAM_USER_ID:'test-account', INSTAGRAM_API_VERSION:'v-test', PUBLISH_URL_SECRET:'test-only-signing', META_APP_SECRET:'test-only-app', META_VERIFY_TOKEN:'test-only-verify' };
  const pending=[];
  const ctx={waitUntil(p){pending.push(p);},passThroughOnException(){}};
  const {default:worker}=await import('../../dist/server/index.js');
  async function request(path, {method='GET',body,headers={},authenticated=true}={}) {
    return worker.fetch(new Request('https://reelvolt.test'+path,{method,headers:{...(authenticated?{'oai-authenticated-user-email':'test@example.com'}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}),env,ctx);
  }
  async function drain() { while(pending.length) await Promise.all(pending.splice(0)); }
  await request('/api/inbox/status');
  return {sqlite,DB,env,objects,ctx,worker,request,drain,close:()=>sqlite.close()};
}

export function seedReel(f, fields={}) {
  const row={message_id:crypto.randomUUID(),sender_id:'web:test@example.com',source_url:'https://www.instagram.com/reel/'+crypto.randomUUID().replaceAll('-','')+'/',rights_confirmed:1,status:'ready',storage_key:'test.mp4',filename:'test.mp4',content_type:'video/mp4',publication_mode:'approval',publish_status:'awaiting_approval',completed_at:'2026-09-01 12:00:00',...fields};
  const names=Object.keys(row);
  const result=f.sqlite.prepare('INSERT INTO reels ('+names.join(',')+') VALUES ('+names.map(()=>'?').join(',')+')').run(...Object.values(row));
  return Number(result.lastInsertRowid);
}
