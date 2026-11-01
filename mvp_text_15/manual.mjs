/** Public-output console adapter. All decisions are explicit input; no play policy. */
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
const save=process.argv[2];
if(!save)throw new Error('node manual.mjs SAVE < input.json');
const input=JSON.parse(readFileSync(0,'utf8'));
const commands=Array.isArray(input)?input:(input.commands||[]);
function call(command) {
  const r=spawnSync(process.execPath,[cli,'--save',save,'--command-json','-'],{input:JSON.stringify(command),encoding:'utf8'});
  if(r.status!==0)throw new Error(r.stderr||r.stdout);
  return JSON.parse(r.stdout);
}
const effects=[];
let output;
for(const command of commands){output=call(command);effects.push(...(output.events||[]));}
if(!output)output=call({command:input.map?'map':'show'});
if(input.auto!==false&&output.view?.phase==='roll'){
  output=call({command:'roll'});effects.push(...(output.events||[]));
}
let previews;
if(input.auto!==false&&output.view?.phase==='choose')previews=call({command:'preview'}).result;
const v=output.view;
const person=g=>({name:g.name,t:g.t,h:g.h,pattern:g.pattern,reward:g.reward,power:g.power,attackBonus:g.attackBonus,attack:g.attackText});
const entity=e=>[e.id,e.type,e.floor,e.c,e.p,e.uses,e.shield];
function forecast(p){return {slot:p.slot??p.selected?.slot,die:p.selected,path:p.path,summary:p.summary,attacks:p.attacks?.map(a=>[a.floor,a.power,a.absorbed,a.afterC,a.afterP]),uncertainty:p.uncertainPenalty??p.uncertainty,after:p.after?.entities.map(entity)};}
const result={save,classification:output.classification,act:v?.act,phase:v?.phase,node:v?.currentNode,completed:v?.completed,souls:v?.souls,floors:v?.floorCount,equipment:v?.equipped?.map(d=>[d.slot,d.type,d.faces]),entities:v?.entities?.map(entity),visitor:v?.visitor?{...person(v.visitor),pos:v.visitor.pos,a:v.visitor.a,f:v.visitor.f,turn:v.visitor.turn}:null,guestIndex:v?.guestIndex,dice:v?.dice,inactive:v?.inactive,limit:v?.inactiveLimit,exit:v?.escape,stats:v?.stats,
  next:v?.availableNodes?.map(n=>({id:n.id,kind:n.kind,guests:n.guests?.map(person)})),
  contents:v?.node?.contents,reward:v?.reward,events:effects.map(e=>({kind:e.kind,text:e.text,floor:e.floor,amount:e.amount,entityId:e.entityId,targetId:e.targetId})),
  previews:previews?.map(forecast),result:output.result};
if(input.map)result.map=(v?.map||call({command:'map'}).view.map).map(n=>({id:n.id,kind:n.kind,status:n.status,next:n.next,guests:n.guests?.map(person)}));
if(output.result&&commands.at(-1)?.command==='preview')result.result=Array.isArray(output.result)?output.result.map(forecast):forecast(output.result);
if(input.brief){
  const p=result.previews?.map(x=>({slot:x.slot,value:x.die?.value,to:x.summary.destination,fear:x.summary.fear,hearts:x.summary.hearts,kill:x.summary.killed,loss:x.summary.losses.map(l=>[l.id,l.tokens,l.destroyed]),a:x.summary.anxietyAfter,attacks:x.attacks,risk:x.uncertainty}));
  console.log(JSON.stringify({phase:result.phase,act:result.act,node:result.node,completed:result.completed,souls:result.souls,floors:result.floors,eq:result.equipment?.map(d=>d[1]),ent:result.entities,v:result.visitor?{name:result.visitor.name,pos:result.visitor.pos,a:result.visitor.a,f:result.visitor.f,h:result.visitor.h,t:result.visitor.t,turn:result.visitor.turn,pattern:result.visitor.pattern}:null,dice:result.dice?.map(d=>[d.slot,d.value,d.type]),stats:result.stats,next:result.next?.length?result.next:undefined,contents:result.contents,reward:result.reward?.creatures||result.reward,events:result.events.filter(e=>!['move','anxiety','choose','roll'].includes(e.kind)),p,result:result.result,map:result.map}));
}else console.log(JSON.stringify(result));
