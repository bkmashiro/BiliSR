import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {gzipSync} from 'node:zlib';
const source=process.env.BILISR_BUNDLE ? readFileSync(process.env.BILISR_BUNDLE,'utf8') : readFileSync(new URL('../vendor/fflate-0.8.2.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/view.js',import.meta.url),'utf8');
const opaque=Buffer.from([0x12,0x02,0x08,0x01]);
const ad=Buffer.from([0x3a,0x02,0x08,0x01]); // View.CM field 7
function frame(data,flag=1){const h=Buffer.alloc(5);h[0]=flag;h.writeUInt32BE(data.length,1);return Buffer.concat([h,data]);}
function invoke(data,extra={},method='View'){
 const done=[],logs=[];
 const headers={'content-type':'application/grpc','grpc-encoding':'gzip','Content-Length':String(data.length),...extra};
 const original=Buffer.from(data);
 runInNewContext(source,{$request:{url:'https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/'+method,headers:{}},$response:{body:new Uint8Array(data),headers},$done:r=>done.push(r),console:{log:x=>logs.push(x)},Uint8Array,ArrayBuffer});
 assert.equal(done.length,1);assert.deepEqual(data,original);return {result:done[0],logs};
}
test('gzip View filters CM, emits uncompressed frame and consistent headers',()=>{
 const input=frame(gzipSync(Buffer.concat([opaque,ad])));
 const {result,logs}=invoke(input);
 assert.ok(result.body,'compressed advertisement must be filtered');
 assert.deepEqual(Buffer.from(result.body),frame(opaque,0));
 assert.equal(result.headers['Content-Length'],String(opaque.length+5));
 assert.equal(Object.keys(result.headers).some(k=>k.toLowerCase()==='grpc-encoding'),false);
 assert.ok(logs.some(l=>l.includes('filtered View')));
});
test('unchanged gzip is preserved byte-for-byte with original headers',()=>{
 assert.equal(Object.keys(invoke(frame(gzipSync(opaque))).result).length,0);
});
test('invalid gzip CRC and length are passed through',()=>{
 const valid=gzipSync(Buffer.concat([opaque,ad]));
 for(const index of [valid.length-8,valid.length-4]){
  const corrupt=Buffer.from(valid);corrupt[index]^=1;
  assert.equal(Object.keys(invoke(frame(corrupt)).result).length,0);
 }
});
test('truncated, unknown encoding, multiple frames/members and reserved flags pass through',()=>{
 const zip=gzipSync(ad);const badFlags=Buffer.from(zip);badFlags[3]=0x20;
 for(const data of [frame(zip.subarray(0,zip.length-1)),Buffer.concat([frame(zip),frame(zip)]),frame(Buffer.concat([zip,zip])),frame(badFlags)]) assert.equal(Object.keys(invoke(data).result).length,0);
 assert.equal(Object.keys(invoke(frame(zip),{'grpc-encoding':'br'}).result).length,0);
});
test('oversized decoded message is rejected even when footer lies',()=>{
 const zip=gzipSync(Buffer.alloc(1048576,65));
 for(const lie of [false,true]){
  const z=Buffer.from(zip);if(lie)z.writeUInt32LE(8,z.length-4);
  const {result,logs}=invoke(frame(z));assert.equal(Object.keys(result).length,0);
  assert.ok(logs.some(l=>/limit|large/.test(l)),'must report limit rejection');
 }
});
test('gzip filtering works across all remaining supported methods',()=>{
 for(const [method,input] of [
  ['AIRelateAsync',Buffer.from([10,2,8,1])],
  ['RelatesFeed',Buffer.from([10,2,8,4])],
  ['ViewProgress',Buffer.from([10,4,10,2,8,1])]
 ]) {
  const plain=invoke(frame(input,0),{},method).result;
  const zipped=invoke(frame(gzipSync(input)),{},method).result;
  assert.ok(plain.body);assert.deepEqual(Buffer.from(zipped.body),Buffer.from(plain.body));
 }
});
test('large gzip streams preserve opaque data across chunk boundaries',()=>{
 const payload=Buffer.alloc(65536);for(let i=0;i<payload.length;i++)payload[i]=(i*31+(i>>>8))&255;
 const field=Buffer.concat([Buffer.from([0x12,0x80,0x80,4]),payload]);
 const {result}=invoke(frame(gzipSync(Buffer.concat([field,ad]))));
 assert.deepEqual(Buffer.from(result.body),frame(field,0));
});
test('uncompressed frame remains supported even with grpc-encoding gzip',()=>{
 assert.deepEqual(Buffer.from(invoke(frame(Buffer.concat([opaque,ad]),0)).result.body),frame(opaque,0));
});
