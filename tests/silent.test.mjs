import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scripts={
 feed:readFileSync(process.env.BILISR_FEED_BUNDLE||new URL('../src/feed.js',import.meta.url),'utf8'),
 view:readFileSync(process.env.BILISR_BUNDLE||new URL('../src/view.js',import.meta.url),'utf8'),
};
function invoke(source,url,body,headers){
 const messages=[],done=[];
 const console=new Proxy({}, {get:(_,method)=>(...args)=>messages.push([String(method),...args])});
 runInNewContext(source,{$request:{url,headers:{}},$response:{body,headers},console,$done:r=>done.push(r),Uint8Array,ArrayBuffer});
 assert.equal(done.length,1);
 assert.deepEqual(messages,[],'release scripts must be silent on all response paths');
 return done[0];
}
test('feed emits no logs for filtering, unchanged, malformed or oversized input',()=>{
 const url='https://app.bilibili.com/x/v2/feed/index';
 for(const body of [JSON.stringify({code:0,data:{items:[{card_type:'cm_v2',card_goto:'ad_av'}]}}),JSON.stringify({code:0,data:{items:[]}}),'{bad',' '.repeat(4194305),undefined])invoke(scripts.feed,url,body,{});
});
test('video emits no logs for filtering, pass-through, malformed or missing input',()=>{
 const url='https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/View';
 for(const body of [new Uint8Array([0,0,0,0,4,0x3a,2,8,1]),new Uint8Array([0,0,0,0,0]),new Uint8Array([0,0,0,0,2,0x0a,0xff]),undefined])invoke(scripts.view,url,body,{'content-type':'application/grpc'});
});
test('release scripts contain no console or notification hooks',()=>{
 for(const [name,source] of Object.entries(scripts))assert.doesNotMatch(source,/\bconsole\b|\$notification\b|\$notify\b/,name+' has an output hook');
});
