// Synthetic, read-only layout fixture, not a normal campaign or save game.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import * as engine from './engine.js';
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
const testSource=readFileSync(new URL('./app-view.test.js',import.meta.url),'utf8');
const factory=testSource.slice(testSource.indexOf('function harness(){'),testSource.indexOf('function fixture('));
const create=new Function('source','vm',...Object.keys(engine),factory+';return harness;');
const v=create(app,vm,...Object.values(engine))();
v.run(`game=new Game(31001);onTitle=false;game.visit('a1-d1-c1');game.s.floorCount=10;game.s.entities=[];
['gaze','footsteps','owner','portrait','safe','nepenthes','barnacle','collector','prophet','samara'].forEach((type,i)=>game._add(type,i+1));
newDrafts();modal=null;game.startService();game.s.equipped=['long','even','normal'];game.s.visitor.a=12;game.s.visitor.greed=2;game.s.visitor.prophecy=4;
game.s.phase='choose';game.s.dice=[{slot:0,type:'long',face:5,value:8},{slot:1,type:'even',face:3,value:4},{slot:2,type:'normal',face:2,value:3}];game.choose(0);render();`);
const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>USER 4 · 10층 정적 배치 검사</title><link rel="stylesheet" href="../styles.css"><body><div id="app">'+v.html()+'</div></body></html>';
writeFileSync(new URL('./validation/hotel-10.html',import.meta.url),html);
console.log('Generated validation/hotel-10.html (synthetic, static, controls inactive)');
