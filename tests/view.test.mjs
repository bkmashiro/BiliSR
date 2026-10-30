import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const script = readFileSync(process.env.BILISR_BUNDLE || new URL('../src/view.js', import.meta.url), 'utf8');
const base = 'https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/';
function vi(n) {
  const r=[]; do { const x=n%128; n=Math.floor(n/128);r.push(n?x|128:x); } while(n);
  return Buffer.from(r);
}
const b=(...xs)=>Buffer.concat(xs.map(x=>Buffer.from(x)));
const scalar=(n,k)=>b(vi(n*8),vi(k));
const field=(n,p)=>b(vi(n*8+2),vi(p.length),p);
const grpc=(data)=>b([0,0,0,0,data.length],data);
function invoke(path,data, options={}) {
  let result, count=0; const logs=[];
  const response={body:data,headers:options.headers??{'content-type':'application/grpc'}};
  const sandbox={
    $request:{url:options.url??base+path,headers:options.requestHeaders??{'user-agent':'bili-universal/999','x-bili-moss-engine-type':'1'}},
    $response:response,
    $done:(x)=>{result=x;count++},
    console:{log:(m)=>logs.push(m)},Uint8Array, ArrayBuffer,
  };
  runInNewContext(script,sandbox);
  assert.equal(count,1,'exactly one done()');
  assert.deepEqual(logs,[],'video filter must be silent');
  return {result, logs};
}
function out(path,input,opts){let r=invoke(path,input,opts);return r.result.body?Buffer.from(r.result.body):Buffer.from(input);}
const opaque=field(100,Buffer.from('unknown-data'));
const norm= b(scalar(1,1),opaque);
const adType=b(scalar(1,4),opaque);
const adStock=b(scalar(1,1),field(11,b([])),opaque);
const adBasic=b(scalar(1,8),field(12,field(6,Buffer.from('uid'))),opaque);
const future=b(scalar(1,99),opaque);
const rel=(cards)=>b(...cards.map(x=>field(1,x)),opaque);
const module=(cards)=>b(scalar(1,28),field(22,rel(cards)),opaque);
const otherModule=b(scalar(1,70),field(22,rel([adType])),opaque);
const tab=(modules)=>b(...modules.map(m=>field(1,m)),opaque);
const frameBody=(d)=>grpc(d);

test('AIRelateAsync drops CM and only explicit recommendation ads; preserves unknown metadata',()=>{
  const payload=b(field(1,field(9,opaque)),field(2,tab([module([norm,adType,adStock,adBasic,future]),otherModule])),opaque);
  const expected=b(field(2,tab([module([norm,future]),otherModule])),opaque);
  assert.deepEqual(out('AIRelateAsync',grpc(payload)),grpc(expected));
});
test('AIRelateAsync pass-through unchanged, including unknown and future cards',()=>{
  const p=grpc(b(field(2,tab([module([norm,future])])),opaque));
  assert.deepEqual(out('AIRelateAsync',p),p);
});
test('AIRelateAsync respects inactive oneof banner',()=>{
  const inactive=b(module([adType]),field(23,Buffer.from('active-banner')));
  const p=grpc(field(2,tab([inactive])));
  assert.deepEqual(out('AIRelateAsync',p),p);
});
test('RelatesFeed preserves normal and future cards',()=>{
  const p=grpc(rel([norm,adType,adBasic,future]));
  assert.deepEqual(out('RelatesFeed',p),grpc(rel([norm,future])));
});
test('View removes top-level CM, ad modules and related ads; preserves unrelated view data',()=>{
  // view.tab(5) -> tab.tab_module(1) -> tab_module.introduction(2)
  // -> introduction.modules(2) -> module
  const promo=b(scalar(1,29),opaque);
  const intro=b(field(2,module([norm,adType])),field(2,promo),field(2,otherModule),opaque);
  const tmod=b(scalar(1,1),field(2,intro));
  const p=grpc(b(field(2,opaque),field(5,field(1,tmod)),field(7,field(1,opaque)),opaque));
  const expectedIntro=b(field(2,module([norm])),field(2,otherModule),opaque);
  const expect=grpc(b(field(2,opaque),field(5,field(1,b(scalar(1,1),field(2,expectedIntro)))),opaque));
  assert.deepEqual(out('View',p),expect);
});
test('ViewProgress removes only videoGuide material, not contract and video points',()=>{
  const videoGuide=b(field(1,Buffer.from('ad')),field(2,opaque),field(3,opaque));
  const p=grpc(b(field(1,videoGuide),field(3,opaque)));
  const expected=grpc(b(field(1,b(field(2,opaque),field(3,opaque))),field(3,opaque)));
  assert.deepEqual(out('ViewProgress',p),expected);
});
test('no transformations for gzip/multiple-frame/bad protobuf/huge payload/wrong URL',()=>{
  const data=field(1,Buffer.from('ad'));
  const zipped=b(grpc(data));zipped[0]=1;
  assert.deepEqual(out('AIRelateAsync',zipped),zipped);
  const multiple=b(grpc(data),grpc(data));assert.deepEqual(out('AIRelateAsync',multiple),multiple);
  const malformed=grpc(b([0x0a,0xff]));assert.deepEqual(out('AIRelateAsync',malformed),malformed);
  const big=Buffer.alloc(262145);assert.deepEqual(out('AIRelateAsync',big),big);
  const wrong=b(grpc(data));assert.deepEqual(out('AIRelateAsync',wrong,{url:'https://example.com/'+base.split('/').at(-1)}),wrong);
});
test('rewritten response has correct frame length and matching grpc-status',()=>{
  const p=grpc(field(1,Buffer.from('ad')));
  const r=invoke('AIRelateAsync',p);
  assert.deepEqual(Buffer.from(r.result.body),Buffer.from([0,0,0,0,0]));
  assert.equal(r.result.headers['grpc-status'],'0');
  const international=invoke('AIRelateAsync',p,{requestHeaders:{'user-agent':'bili-inter/1'},headers:{'content-type':'application/grpc','grpc-status':'0','Content-Length':'8'}});
  assert.equal(international.result.headers['grpc-status'],undefined);
  assert.equal(international.result.headers['Content-Length'],'5');
});
test('unmodified response never changes headers or body',()=>{
  const p=grpc(opaque);
  const r=invoke('View',p,{headers:{'content-type':'application/grpc'}});
  assert.equal(Object.keys(r.result).length,0);
});
