import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, seedReel } from './helpers/runtime.mjs';
import { withPublicationLock } from '../worker/publication-lock.ts';

async function setup(t) { const f=await fixture(); t.after(()=>f.close()); return f; }
function meta(t, {fail=false}={}) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));
    calls.push({path:url.pathname,method:options.method||'GET',body:options.body});
    if(options.method==='POST' && url.pathname.endsWith('/media')) return Response.json(fail?{error:{message:'Provider unavailable'}}:{id:'container-1'},{status:fail?503:200});
    if(url.pathname.endsWith('/media_publish')) return Response.json({id:'media-1'});
    if(url.pathname.endsWith('/container-1')) return Response.json({status_code:'FINISHED'});
    if(url.pathname.endsWith('/media-1')) return Response.json({permalink:'https://www.instagram.com/reel/test/'});
    if(url.pathname.endsWith('/media')) return Response.json({data:[]});
    throw new Error('Unexpected external request: '+url.pathname);
  });
  return calls;
}
const row=(f,id)=>f.sqlite.prepare('SELECT * FROM reels WHERE id=?').get(id);

test('protected routes reject missing users, cross-origin writes and invalid signed media',async t=>{
  const f=await setup(t);
  for(const path of ['/api/reels','/api/dashboard','/api/analytics','/api/inbox/status']) {
    const r=await f.request(path,{authenticated:false});assert.equal(r.status,401,path);assert.equal(r.headers.get('cache-control'),'no-store');
  }
  for(const [path,method] of [['/api/reels/intake','POST'],['/api/studio-settings','PUT'],['/api/reels/1/publish','POST'],['/api/reels/1','DELETE'],['/api/shortcut/access','POST']]) {
    assert.equal((await f.request(path,{method,body:{},headers:{origin:'https://other.test'}})).status,403,path);
  }
  assert.equal((await f.request('/publish-media/1.mp4?expires=1&signature=bad')).status,403);
  assert.equal((await f.request('/api/internal/reels/1/resolver-result',{method:'POST',body:{}})).status,401);
  assert.equal((await f.request('/api/integrations/status')).status,401);
});

test('legacy publishing routes are retired without touching historical records',async t=>{
  const f=await setup(t);const id=seedReel(f);
  f.sqlite.prepare("INSERT INTO youtube_publications(reel_id,video_id) VALUES (?, 'historical')").run(id);
  for(const path of ['/api/youtube/connect','/api/internal/youtube/jobs/claim','/api/reels/1/youtube/retry','/worker-media/1.mp4']) assert.equal((await f.request(path,{method:'POST'})).status,410);
  assert.equal(f.sqlite.prepare('SELECT video_id FROM youtube_publications').get().video_id,'historical');
});

test('manual publication of a Direct Reel completes with the queue disabled and is idempotent',async t=>{
  const f=await setup(t);const calls=meta(t);const id=seedReel(f,{sender_id:'instagram:authorized'});
  const response=await f.request('/api/reels/'+id+'/publish',{method:'POST',body:{}});assert.equal(response.status,202);assert.equal((await response.json()).queued,false);
  await f.drain();assert.equal(row(f,id).publish_status,'published');
  assert.equal(calls.filter(c=>c.path.endsWith('/media_publish')).length,1);
  assert.equal((await f.request('/api/reels/'+id+'/publish',{method:'POST'})).status,409);
});

test('automatic queue starts a due Reel immediately, respects FIFO and the interval',async t=>{
  const f=await setup(t);const calls=meta(t);
  const first=seedReel(f);const second=seedReel(f,{completed_at:'2026-09-02 12:00:00'});
  const download=seedReel(f,{publication_mode:'download_only',publish_status:'not_requested'});
  assert.equal((await f.request('/api/studio-settings',{method:'PUT',body:{autoPublishEnabled:true,publishIntervalMinutes:240,coverMode:'none',captionEnabled:false}})).status,200);
  assert.equal(row(f,first).publish_status,'queued');assert.equal(row(f,download).publish_status,'not_requested');
  assert.ok(row(f,first).scheduled_for < row(f,second).scheduled_for);
  const r=await f.request('/api/publication-queue/process',{method:'POST'});assert.equal((await r.json()).processed,true);
  assert.equal(row(f,first).publish_status,'published');assert.equal(row(f,second).publish_status,'queued');
  assert.equal(calls.filter(c=>c.path.endsWith('/media_publish')).length,1);
  const next=await f.request('/api/publication-queue/process',{method:'POST'});assert.equal((await next.json()).reason,'interval');
});

test('disabled cron neither resumes active publication nor approves prepared Reels',async t=>{
  const f=await setup(t);const calls=meta(t);const id=seedReel(f,{publish_status:'processing',instagram_container_id:'container-1'});const ready=seedReel(f);
  await f.worker.scheduled({scheduledTime:Date.parse('2026-09-09T12:10:00Z')},f.env,f.ctx);await f.drain();
  assert.equal(row(f,id).publish_status,'processing');assert.equal(row(f,ready).publish_status,'awaiting_approval');assert.equal(calls.length,0);
});

test('manual publication does not start a second active Reel',async t=>{
  const f=await setup(t);const calls=meta(t);seedReel(f,{publish_status:'processing',instagram_container_id:'container-1'});const id=seedReel(f);
  assert.equal((await f.request('/api/reels/'+id+'/publish',{method:'POST'})).status,409);await f.drain();
  assert.equal(row(f,id).publish_status,'awaiting_approval');assert.equal(calls.length,0);
});

test('publication lease excludes overlapping executions and recovers expired leases',async t=>{
  const f=await setup(t);let release;const gate=new Promise(r=>{release=r;});let starts=0;
  const first=withPublicationLock(f.DB,async()=>{starts++;await gate;});
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(await withPublicationLock(f.DB,async()=>{starts++;}),{busy:true});
  release();await first;assert.equal(starts,1);
  f.sqlite.prepare("INSERT INTO instagram_publication_lock VALUES (1,'expired',0)").run();
  await withPublicationLock(f.DB,async()=>{starts++;});assert.equal(starts,2);
  await assert.rejects(withPublicationLock(f.DB,async()=>{throw new Error('failure');}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM instagram_publication_lock').get().n,0);
});

test('provider failure leaves a recoverable state and releases publication lock',async t=>{
  const f=await setup(t);meta(t,{fail:true});const id=seedReel(f);
  await f.request('/api/reels/'+id+'/publish',{method:'POST'});await f.drain();
  assert.equal(row(f,id).publish_status,'failed');assert.match(row(f,id).publish_error,/Provider unavailable/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM instagram_publication_lock').get().n,0);
});

test('reading dashboards does not reschedule or publish queued Reels',async t=>{
  const f=await setup(t);const calls=meta(t);const id=seedReel(f,{publish_status:'queued',approved_at:'2026-09-01 12:00:00',scheduled_for:'2026-09-01 16:00:00'});
  f.sqlite.exec('UPDATE studio_settings SET auto_publish_enabled=1');const before=row(f,id);
  for(const path of ['/api/reels','/api/dashboard','/api/analytics']) assert.equal((await f.request(path)).status,200,path);
  assert.deepEqual(row(f,id),before);assert.equal(calls.length,0);
});

test('failed media upload recovers the same record and rejects invalid uploads',async t=>{
  const f=await setup(t);const id=seedReel(f,{status:'failed',storage_key:null,publish_status:'blocked'});
  const path='/api/reels/'+id+'/media';
  assert.equal((await f.request(path,{method:'POST',body:'bad',headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await f.request(path,{method:'POST',body:'bytes',headers:{'content-type':'video/mp4','content-length':String(91*1024*1024)}})).status,413);
  assert.equal((await f.request(path,{method:'POST',body:'test-mp4-bytes',headers:{'content-type':'video/mp4'}})).status,201);
  assert.equal(row(f,id).status,'ready');assert.equal(row(f,id).publish_status,'awaiting_approval');
  assert.equal((await f.request(path,{method:'POST',body:'again',headers:{'content-type':'video/mp4'}})).status,409);assert.equal(f.objects.size,1);
});

test('archiving a published Reel preserves its metrics and rejects active publication deletion',async t=>{
  const f=await setup(t);const id=seedReel(f,{publish_status:'published',instagram_media_id:'historical',published_at:'2026-09-01 12:00:00'});
  f.sqlite.prepare('INSERT INTO reel_insights(reel_id,views) VALUES (?,42)').run(id);
  assert.equal((await f.request('/api/reels/'+id,{method:'DELETE'})).status,200);
  assert.ok(row(f,id).archived_at);assert.equal(row(f,id).instagram_media_id,'historical');assert.equal(f.sqlite.prepare('SELECT views FROM reel_insights').get().views,42);
  const active=seedReel(f,{publish_status:'processing'});assert.equal((await f.request('/api/reels/'+active,{method:'DELETE'})).status,409);
});

test('webhook verifies challenge and rejects unsigned or malformed events',async t=>{
  const f=await setup(t);
  assert.equal(await (await f.request('/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test-only-verify&hub.challenge=hello')).text(),'hello');
  assert.equal((await f.request('/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=hello')).status,403);
  assert.equal((await f.request('/webhooks/instagram',{method:'POST',body:{}})).status,401);
});

test('shortcut credentials are hashed, invalid credentials rejected and revocation honored',async t=>{
  const f=await setup(t);
  const access=await (await f.request('/api/shortcut/access',{method:'POST'})).json();
  const stored=f.sqlite.prepare('SELECT token_hash FROM shortcut_access').get();assert.notEqual(stored.token_hash,access.token);
  assert.equal((await f.request('/api/shortcut/intake',{method:'POST',body:{url:'invalid'},headers:{authorization:'Bearer '+access.token}})).status,400);
  assert.equal((await f.request('/api/shortcut/intake',{method:'POST',body:{},headers:{authorization:'Bearer wrong'}})).status,401);
  await f.request('/api/shortcut/access',{method:'DELETE'});
  assert.equal((await f.request('/api/shortcut/intake',{method:'POST',body:{},headers:{authorization:'Bearer '+access.token}})).status,401);
});


test('intake downloads once, deduplicates canonical URLs and requires authorization',async t=>{
  const f=await setup(t);let downloads=0;
  t.mock.method(globalThis,'fetch',async()=>{downloads++;return new Response('mock-mp4',{headers:{'content-type':'video/mp4'}});});
  assert.equal((await f.request('/api/reels/intake',{method:'POST',body:{url:'https://example.com/video',rightsConfirmed:true}})).status,400);
  assert.equal((await f.request('/api/reels/intake',{method:'POST',body:{url:'https://www.instagram.com/reel/TestReel/'}})).status,400);
  const body={url:'https://www.instagram.com/reel/TestReel/?igsh=tracking',rightsConfirmed:true};
  const accepted=await f.request('/api/reels/intake',{method:'POST',body});assert.equal(accepted.status,202);await f.drain();
  const reel=f.sqlite.prepare('SELECT * FROM reels').get();assert.equal(reel.status,'ready');assert.equal(reel.publish_status,'awaiting_approval');
  const duplicate=await f.request('/api/reels/intake',{method:'POST',body:{...body,url:'https://instagram.com/reel/TestReel/'}});assert.equal((await duplicate.json()).reason,'duplicate');assert.equal(downloads,1);
});

test('malformed JSON has a safe API error',async t=>{
  const f=await setup(t);const r=await f.request('/api/reels/intake',{method:'POST',body:'{'});assert.equal(r.status,400);assert.equal(r.headers.get('cache-control'),'no-store');
});

test('simultaneous manual requests cannot create duplicate containers',async t=>{
  const f=await setup(t);const calls=meta(t);const id=seedReel(f);
  await Promise.all([f.request('/api/reels/'+id+'/publish',{method:'POST'}),f.request('/api/reels/'+id+'/publish',{method:'POST'})]);await f.drain();
  assert.equal(row(f,id).publish_status,'published');assert.equal(calls.filter(c=>c.method==='POST'&&c.path.endsWith('/media')).length,1);assert.equal(calls.filter(c=>c.path.endsWith('/media_publish')).length,1);
});


test('resolver callback authenticates and accepts an MP4 only once',async t=>{
  const f=await setup(t);f.env.REEL_DOWNLOAD_WORKER_SECRET='test-only-worker';const id=seedReel(f,{status:'downloading',storage_key:null});const path='/api/internal/reels/'+id+'/resolver-result';
  const headers={authorization:'Bearer test-only-worker','content-type':'video/mp4'};
  assert.equal((await f.request(path,{method:'POST',body:'mock-mp4',headers})).status,201);
  assert.equal((await f.request(path,{method:'POST',body:'duplicate',headers})).status,409);assert.equal(f.objects.size,1);assert.equal(row(f,id).status,'ready');
});

test('signed video is limited to the requested Reel and expires',async t=>{
  const f=await setup(t);const calls=meta(t);const id=seedReel(f);await f.env.VIDEOS.put('test.mp4','mock-mp4',{httpMetadata:{contentType:'video/mp4'}});
  await f.request('/api/reels/'+id+'/publish',{method:'POST'});await f.drain();
  const creation=calls.find(c=>c.method==='POST'&&c.path.endsWith('/media'));const url=new URL(creation.body.get('video_url'));
  assert.equal((await f.request(url.pathname+url.search,{authenticated:false})).status,200);
  assert.equal((await f.request('/publish-media/'+(id+1)+'.mp4'+url.search,{authenticated:false})).status,403);
  url.searchParams.set('expires','1');assert.equal((await f.request(url.pathname+url.search,{authenticated:false})).status,403);
});

test('changing caption and cover leaves already queued content unchanged',async t=>{
  const f=await setup(t);const id=seedReel(f);
  await f.request('/api/studio-settings',{method:'PUT',body:{autoPublishEnabled:true,caption:'Original',coverMode:'none',publishIntervalMinutes:240}});
  const before=row(f,id);
  await f.request('/api/studio-settings',{method:'PUT',body:{autoPublishEnabled:true,caption:'Changed',coverMode:'video',publishIntervalMinutes:240}});
  assert.equal(row(f,id).caption,'Original');assert.equal(row(f,id).cover_mode,'none');assert.equal(row(f,id).scheduled_for,before.scheduled_for);
});

test('uncertain publication response preserves the container and does not submit a new one',async t=>{
  const f=await setup(t);const id=seedReel(f);let creates=0;let publishes=0;
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));
    if(options.method==='POST'&&url.pathname.endsWith('/media')) {creates++;return Response.json({id:'container-1'});}
    if(url.pathname.endsWith('/media_publish')) {publishes++;throw new Error('Connection interrupted');}
    if(url.pathname.endsWith('/container-1'))return Response.json({status_code:'FINISHED'});
    return Response.json({data:[]});
  });
  await f.request('/api/reels/'+id+'/publish',{method:'POST'});await f.drain();assert.equal(row(f,id).publish_status,'publishing');assert.equal(row(f,id).instagram_container_id,'container-1');
  await f.request('/api/reels/'+id+'/publish',{method:'POST'});await f.drain();assert.equal(creates,1);assert.equal(publishes,1);
});


test('Insights refresh persists official response values and daily snapshots',async t=>{
  const f=await setup(t);const id=seedReel(f,{publish_status:'published',instagram_media_id:'media-1',published_at:'2026-09-01 12:00:00'});
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(String(input));assert.ok(url.pathname.endsWith('/insights'));
    return Response.json({data:(url.searchParams.get('metric')||'').split(',').map(name=>({name,values:[{value:name==='views'?123:10}]}))});
  });
  assert.equal((await f.request('/api/analytics/refresh',{method:'POST'})).status,202);await f.drain();
  assert.equal(f.sqlite.prepare('SELECT views FROM reel_insights WHERE reel_id=?').get(id).views,123);
  assert.equal(f.sqlite.prepare('SELECT views FROM reel_insight_snapshots WHERE reel_id=?').get(id).views,123);
  assert.equal(f.sqlite.prepare('SELECT status FROM instagram_insight_sync').get().status,'idle');
});

test('Insights permission errors preserve previous metrics and report failure',async t=>{
  const f=await setup(t);const id=seedReel(f,{publish_status:'published',instagram_media_id:'media-1',published_at:'2026-09-01 12:00:00'});
  f.sqlite.prepare('INSERT INTO reel_insights(reel_id,views) VALUES (?,123)').run(id);
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Missing permission',code:10}},{status:403}));
  t.mock.method(console,'error',()=>{});
  await f.request('/api/analytics/refresh',{method:'POST'});await f.drain();
  assert.equal(f.sqlite.prepare('SELECT views FROM reel_insights WHERE reel_id=?').get(id).views,123);
  const sync=f.sqlite.prepare('SELECT * FROM instagram_insight_sync').get();assert.equal(sync.status,'failed');assert.match(sync.last_error,/Missing permission/);
});


test('legacy overlapping states resume oldest first without deadlocking recovery',async t=>{
  const f=await setup(t);const calls=meta(t);
  const oldest=seedReel(f,{publish_status:'processing',instagram_container_id:'container-1'});
  const later=seedReel(f,{publish_status:'processing',instagram_container_id:'container-2',completed_at:'2026-09-02 12:00:00'});
  assert.equal((await f.request('/api/reels/'+later+'/publish',{method:'POST'})).status,409);
  assert.equal((await f.request('/api/reels/'+oldest+'/publish',{method:'POST'})).status,202);await f.drain();
  assert.equal(row(f,oldest).publish_status,'published');assert.equal(row(f,later).publish_status,'processing');assert.equal(calls.filter(c=>c.path.endsWith('/media_publish')).length,1);
});


test('Meta PUBLISHED status never submits another publication when the media ID is unknown',async t=>{
  const f=await setup(t);const id=seedReel(f,{publish_status:'processing',instagram_container_id:'container-1'});let writes=0;
  t.mock.method(globalThis,'fetch',async(input,options={})=>{if(options.method==='POST')writes++;return Response.json(String(input).includes('/container-1')?{status_code:'PUBLISHED'}:{data:[]});});
  await f.request('/api/reels/'+id+'/publish',{method:'POST'});await f.drain();
  assert.equal(writes,0);assert.equal(row(f,id).publish_status,'publishing');assert.match(row(f,id).publish_error,/Meta confirma/);
});
