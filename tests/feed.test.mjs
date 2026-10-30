import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(process.env.BILISR_FEED_BUNDLE || new URL('../src/feed.js',import.meta.url),'utf8');
const base='https://app.bilibili.com';
function call(path,body,options={}){
 const raw=Object.hasOwn(options,'rawBody')?options.rawBody:(typeof body==='string'?body:JSON.stringify(body)),done=[],logs=[];
 runInNewContext(src,{$request:{url:(options.host||base)+path},$response:{body:raw,headers:{'Content-Type':'application/json','Content-Length':'100','Content-Encoding':'gzip',ETag:'old','X-Preserve':'yes'},status:200},$done:r=>done.push(r),console:{log:x=>logs.push(x)}});
 assert.equal(done.length,1);assert.deepEqual(logs,[],'feed must be silent');return {r:done[0],logs};
}
function result(path,body){const {r}=call(path,body);assert.ok(r.body,'response should be filtered');return JSON.parse(r.body);}
const normal={card_type:'small_cover_v9',card_goto:'av',title:'normal',ad_info:null};
const future={card_type:'future_type',card_goto:'future',unknown:{a:1}};
test('feed removes marked ads but keeps ordinary, live, game and unknown cards',()=>{
 const items=[normal,{card_type:'cm_v2',card_goto:'ad_av'},{card_type:'cm_double_v9',card_goto:'ad_inline_av'},future,{card_type:'small_cover_v9',card_goto:'live'},{card_type:'small_cover_v10',card_goto:'game'}];
 const doc={code:0,data:{items,cursor:'next'},extra:{untouched:true}};
 const got=result('/x/v2/feed/index?device=phone',doc);
 assert.deepEqual(got.data.items,[normal,future,items[4],items[5]]);assert.equal(got.data.cursor,'next');assert.deepEqual(got.extra,doc.extra);
});
test('carousel removes only ad slides and preserves ordinary slides',()=>{
 const good={type:'archive',title:'video'},unknown={type:'future'};
 const banner={card_type:'banner_v8',card_goto:'banner',hash:'keep',banner_item:[good,{type:'ad'},{type:'ad_inline'},unknown]};
 assert.deepEqual(result('/x/v2/feed/index',{code:0,data:{items:[banner,normal]}}).data.items,[{...banner,banner_item:[good,unknown]},normal]);
});
test('empty ad-only carousel is removed',()=>{
 assert.deepEqual(result('/x/v2/feed/index',{code:0,data:{items:[{card_type:'banner_ipad_v8',card_goto:'banner',banner_item:[{type:'ad'}]},normal]}}).data.items,[normal]);
});
test('changed JSON drops stale encoding, length and cache validator headers',()=>{
 const {r,logs}=call('/x/v2/feed/index',{code:0,data:{items:[{card_type:'cm_v1',card_goto:'ad_web_s'},normal]}});
 assert.ok(r.body);for(const k of ['Content-Length','Content-Encoding','ETag'])assert.equal(r.headers[k],undefined);
 assert.equal(r.headers['X-Preserve'],'yes');assert.deepEqual(logs,[]);
});
test('non-text, missing and oversized bodies pass through silently',()=>{
 const secret='private-body-do-not-log';
 for(const rawBody of [new Uint8Array([1,2,3]),undefined,secret+' '.repeat(4194304)]) {
  const {r,logs}=call('/x/v2/feed/index',null,{rawBody});
  assert.equal(Object.keys(r).length,0);const log=logs.join('\n');
  assert.deepEqual(logs,[]);
  assert.ok(!log.includes(secret));
 }
});
test('unchanged, malformed, oversized, error responses, unrelated host/path pass through',()=>{
 const docs=[{code:0,data:{items:[normal,future]}},{code:-1,data:{items:[{card_type:'cm_v2',card_goto:'ad_av'}]}},{code:0,data:{items:'unknown'}},'{bad',' '.repeat(4194305)];
 for(const doc of docs)assert.equal(Object.keys(call('/x/v2/feed/index',doc).r).length,0);
 for(const path of ['/x/v2/feed/index/story','/x/v2/feed/index/cart','/x/v2/account/myinfo','/x/v2/splash/list/evil'])assert.equal(Object.keys(call(path,{code:0,data:{show:[1]}}).r).length,0);
 assert.equal(Object.keys(call('/x/v2/splash/list',{code:0,data:{show:[1]}},{host:'https://example.com'}).r).length,0);
});
