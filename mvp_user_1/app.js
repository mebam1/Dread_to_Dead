import {Game,CREATURES,GUESTS,SERVICES} from './engine.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
let prefs=read('dread-user1-options',{tutorial:true,speed:'normal'}),seen=read('dread-user1-seen',{});
const save=()=>{try{localStorage.setItem('dread-user1-options',JSON.stringify(prefs));localStorage.setItem('dread-user1-seen',JSON.stringify(seen));}catch{}};
let game=null, tab='web', selection=null, hoverDie=null, modal=null, queue=[],busy=false,tipTimer,tipClose,pinned=null;
const tutorial={
 hotel:['당신의 호텔을 설계하세요','층마다 괴이를 하나 배치합니다. 손님은 위로 이동하며, 맨 위 다음에는 다시 1층으로 돌아옵니다. 먼저 카드의 효과와 다음 손님을 살펴보세요.'],
 cards:['괴이는 카드로 보관됩니다','블러드 웹에서 구매한 괴이는 보관함에 카드로 들어옵니다. 배치하기를 누른 다음 층을 선택하세요. 층에 마우스를 올리면 같은 상세 카드를 볼 수 있습니다.'],
 web:['괴이를 구매하는 블러드 웹','연결된 이전 카드를 구매하면 다음 카드가 열립니다. 카드는 한 번만 구매할 수 있지만, 같은 이름의 다른 카드는 별도로 살 수 있습니다.'],
 coins:['공포와 공포 재화는 달라요','보유 공포 재화는 괴이를 사는 돈입니다. 손님에게 쌓는 공포는 공격 수치이며, 손님을 처치했을 때에만 고정 보상을 받습니다.'],
 dice:['세 눈 중 하나를 선택하세요','각 눈이 이동할 층 수입니다. 마우스를 올리거나 한 번 눌러 경로와 예상 공격을 살펴본 다음 이동 거리를 확정하세요.'],
 route:['통과와 도착은 다른 효과입니다','중간층은 통과 효과만, 마지막 층은 도착 효과만 발동합니다. 도착층의 통과 효과는 함께 발동하지 않습니다.'],
 loop:['꼭대기 다음은 다시 1층','6층을 넘어가면 1층으로 돌아옵니다. 한 바퀴를 돌아도 손님의 공포와 불안은 남습니다.'],
 fear:['공포를 쌓아 심장을 없애세요','공포가 한계에 닿으면 남은 심장 하나가 줄고 공포는 0이 됩니다. 마지막 심장을 없애면 처치하며 손님의 반격도 사라집니다.'],
 anxiety:['불안을 공급하고 수확하세요','문틈의 속삭임이 만든 불안을 이름을 부르는 객실이 소비해 공포로 바꿉니다. 불안은 최대 9이며 다음 손님에게 넘겨지지 않습니다.'],
 attack:['괴이도 공격을 받습니다','손님의 공격은 괴이의 공략도를 올립니다. 한계 12에 닿으면 공략도는 0이 되고 파훼 토큰 하나를 잃습니다. 토큰이 0이면 영구 파괴됩니다.'],
 active:['직접 사용은 해당 층에서','이동 거리를 확정한 뒤, 이동하기 전에 층 안의 버튼을 누르세요. 횟수와 자원이 남으면 같은 턴에 여러 번 사용할 수 있습니다.'],
 target:['효과를 받을 층을 선택하세요','강조된 층이 유효한 대상입니다. 대상을 고르기 전에는 비용을 쓰지 않습니다. 취소 버튼이나 ESC로 돌아갈 수 있습니다.'],
 G:['보호와 충전을 구별하세요','닫히지 않는 방화문의 직접 사용은 이번 턴 공략도 6을 막습니다. 도착 효과는 방어 횟수 1 충전이며, 새 충전분은 다음 턴부터 쓸 수 있습니다.'],
 E:['이미 있는 불안을 증폭합니다','따라오는 발자국을 통과하면 현재 불안만큼, 최대 2만큼 불안이 늘어납니다. 불안이 0일 때는 증폭도 없습니다.'],
 R:['수리는 불안을 소비합니다','벽을 꿰매는 그림자는 불안 2를 써서 공략도를 최대 6 낮춥니다. 파훼 토큰이나 파괴된 괴이는 복구하지 않습니다.'],
 idle:['아무 활동 없이 버티면 위험해요','공포·불안 부여나 직접 사용 없이 3턴이면 무작위 괴이에 공략도 12가 더해집니다. 계속 비활동이면 이후 2턴마다 반복합니다. 충전과 탈출구 설치만으로는 활동이 되지 않습니다.'],
 escape:['출구를 열고 실제로 지나가야 해요','빈층에 출구를 설치한 뒤 손님이 통과하거나 도착하면 영업이 끝납니다. 이미 처치한 보상은 유지하지만 탈출 손님과 남은 손님은 무보상입니다.'],
 destroyed:['파괴된 괴이는 돌아오지 않습니다','파훼 토큰이 0이 된 괴이는 사라지고 빈층이 됩니다. 다른 구매 카드에서 같은 종류를 새로 살 수 있습니다. 배치된 괴이가 전멸하면 즉시 패배합니다.'],
 boundary:['같은 영업의 다음 손님','괴이의 공략도는 0이 되지만 파훼 토큰과 남은 사용 횟수는 유지합니다. 세 손님을 상대할 자원을 나누어 쓰세요.'],
 reset:['영업 종료와 리셋권','영업 종료마다 웹 리셋권 하나를 얻습니다. 자동 갱신은 하지 않으며, 권리를 써야 새 웹이 나옵니다. 다음 영업 시작 때 살아남은 괴이의 토큰과 횟수가 복구됩니다.'],
 boss:['이번에는 보스 한 명','보스의 공격 패턴과 남은 심장 수를 확인하고 배치를 준비하세요. 중간 보스를 탈출시켜도 다음 구간으로 진행할 수 있습니다.'],
 final:['마지막 보스를 처치하세요','호텔의 조사관을 처치하면 승리합니다. 마지막 보스를 탈출시키면 패배합니다.']
};
function teach(...keys){if(!prefs.tutorial)return;for(const key of keys)if(tutorial[key]&&!seen[key]&&!queue.includes(key))queue.push(key);showNextTutorial();}
function showNextTutorial(){if(!modal&&queue.length&&!busy){modal={type:'tutorial',key:queue.shift()};renderModal();}}
function button(text,action,extra='',disabled=false){return '<button class="button '+extra+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+text+'</button>';}
function entity(id){return game.s.entities.find(e=>String(e.id)===String(id));}
function at(floor){return game.s.entities.find(e=>e.floor===floor&&e.p>0);}
function shape(type){return '<span class="shape" data-type="'+type+'" aria-hidden="true"></span>';}
function meter(value,max,color=''){return '<span class="meter"><span class="fill '+color+'" style="width:'+Math.min(100,value/max*100)+'%"></span></span>';}
function effects(type){const d=CREATURES[type];return '<div class="effect-list"><div><span class="effect-label">통과할 때</span><p>'+esc(d.passText||'효과 없음')+'</p></div><div><span class="effect-label">도착할 때</span><p>'+esc(d.arrivalText||'효과 없음')+'</p></div><div><span class="effect-label">직접 사용</span><p>'+esc(d.activeText||'효과 없음')+'</p></div></div>';}
function creatureCard(type,e=null,footer='',extra=''){
 const d=CREATURES[type],own=game?.s.entities.filter(x=>x.type===type).length||0;
 return '<article class="card creature-card '+extra+'" data-type="'+type+'"><div class="card-top">'+shape(type)+'<span class="card-role">'+esc(d.role)+'</span></div><h3 class="card-title">'+esc(d.name)+'</h3>'+effects(type)+'<div class="card-stats">'+(e?'공략도 <strong>'+e.c+'/12</strong> · 파훼 토큰 <strong>'+e.p+'/'+d.maxP+'</strong>':'구매 시 공략도 0 · 파훼 토큰 '+d.maxP+'개')+((type==='G'||type==='B')?'<br>남은 사용 '+(e?e.uses:2)+'/2회 · 새 영업 시작 시 2회로 복구':'')+(e?.shield?'<br>이번 턴 보호 '+e.shield:'')+(type==='R'?'<br>사용마다 불안 2 소비 · 공략도가 있는 대상 필요':'')+'</div>'+(!e?'<div class="muted">현재 같은 종류 '+own+'개 보유</div>':'<div class="muted">'+(e.floor?e.floor+'층에 배치됨':'보관 중')+(game.s.phase==='management'?' · 다음 영업 시작 시 생존 괴이 복구':'')+'</div>')+footer+'</article>';
}
function phaseLabel(){if(busy)return '이동·공격 처리 중';return {management:'구매와 배치',roll:'주사위 굴리기',choose:'이동 거리 선택',prepare:'이동 전 준비',guest_end:'손님 처치',service_end:'영업 정산',won:'호텔의 승리',lost:'영업 종료'}[game.s.phase]||'';}
function header(){
 const s=game.s;
 return '<header class="topbar"><a href="#" class="brand" data-action="title"><span class="brand-mark">◈</span><span>DREAD TO DEAD<small>FEARS GO ROUND</small></span></a><div class="resources"><div class="resource"><span>보유 공포 재화</span><strong>'+s.money+'</strong></div><div class="resource"><span>웹 리셋권</span><strong>'+s.resets+'<small> 개</small></strong></div></div><div class="top-actions">'+button('손님 목록','roadmap','ghost small')+button('도움말','help','ghost small')+button('옵션','options','ghost small')+'</div></header><nav class="progress-strip" aria-label="전투 진행">'+SERVICES.map((r,i)=>'<span class="stage '+(i===s.round?'current':i<s.round?'done':'')+'">'+(i<s.round?'✓ ':i+1+'. ')+esc(r.name)+'</span>').join('')+'</nav>';
}
function shortEffect(type){return {U:'통과: 불안 +2 · 도착: 불안 +4',Q:'도착: 불안 최대 3 → 공포 최대 12',B:'도착: 공포 +2 · 직접 사용: 공포 +6',G:'도착: 방어 횟수 +1 · 직접 사용: 보호 6',E:'통과: 불안 최대 +2 · 도착: 불안 +1',R:'직접 사용: 불안 2 → 공략도 최대 −6'}[type];}
function activeButton(e){
 if(!['B','G','R'].includes(e.type))return '';
 let reason=game.activeReason(e.id);
 if(reason)return '<span class="muted active-reason">'+esc(reason)+'</span>';
 return button(e.type==='B'?'공포 6 주기 · '+e.uses+'회':e.type==='G'?'보호하기 · '+e.uses+'회':'공략도 줄이기 · 불안 2','active:'+e.id,'small');
}
function validFloor(floor){
 if(!selection)return false;const e=at(floor);
 if(selection.kind==='place')return true;
 if(selection.kind==='escape')return !e;
 if(selection.kind==='G')return !!e;
 if(selection.kind==='R')return !!e&&e.c>0;
 return false;
}
function hotel(){
 const s=game.s,view=(s.phase==='prepare'?s.chosen:hoverDie),path=view?game.path(view):[],dest=path.at(-1),attack=view?game.attackList(path):[];
 return '<aside class="hotel-panel"><div class="section-heading"><div><span class="eyebrow">THE HOTEL</span><h2>끝나지 않는 층</h2></div><span class="badge">'+(s.visitor&&s.phase!=='management'?'현재 '+(s.visitor.pos||'입장 전')+(s.visitor.pos?'층':''):'6층 호텔')+'</span></div><div class="hotel-stack">'+[6,5,4,3,2,1].map(f=>{
 const e=at(f),d=e&&CREATURES[e.type],classes=['floor',!e?'empty':'',dest===f?'arrival':path.includes(f)?'transit':'',selection&&validFloor(f)?'targetable':'',selection?.kind==='place'&&entity(selection.id)?.floor===f?'selected':''].join(' ');
 return '<section class="'+classes+'" data-floor="'+f+'" '+(e?'data-entity="'+e.id+'" data-type="'+e.type+'"':'')+' tabindex="0" role="group" aria-label="'+f+'층 '+esc(d?.name||'빈층')+'"><span class="floor-number">'+f+'<small>층</small></span><div class="floor-main"><div class="floor-title">'+(e?shape(e.type)+esc(d.name):s.escape===f?'⇥ 탈출구':'빈층')+(e?'<button class="info-button" data-action="info:'+e.id+'" aria-label="'+esc(d.name)+' 정보">ⓘ</button>':'')+'</div><div class="floor-summary">'+(e?shortEffect(e.type):s.escape===f?'통과·도착 즉시 영업 종료':selection?'이 층 선택':'경영 중 괴이를 배치할 수 있습니다')+'</div>'+(e?'<div class="floor-stats"><span>공략도 '+e.c+'/12 '+meter(e.c,12)+'</span><span>파훼 '+e.p+'/'+d.maxP+'</span>'+(e.shield?'<span class="badge">보호 '+e.shield+'</span>':'')+'</div><div class="floor-actions">'+(s.phase==='management'?button('보관','store:'+e.id,'ghost small')+button('이동','place:'+e.id,'ghost small'):activeButton(e))+'</div>':'')+'</div>'+(s.visitor?.pos===f&&s.phase!=='management'?'<span class="visitor-marker" title="현재 손님" aria-label="현재 손님"></span>':'')+(attack.some(a=>a.floor===f)?'<span class="attack-mark" title="공격 예정">!</span>':'')+'</section>';
 }).join('')+'</div><div class="hotel-foot muted">↑ 위로 이동 · 6층 다음은 1층으로 순환</div></aside>';
}
function inventory(){
 const list=game.s.entities.filter(e=>e.floor==null&&e.p>0);
 return '<div class="panel-header"><div><span class="eyebrow">YOUR COLLECTION</span><h2>보관 중인 괴이 <small>'+list.length+'개</small></h2></div></div><div class="panel-body">'+(list.length?'<div class="card-grid">'+list.map(e=>creatureCard(e.type,e,'<div class="card-actions">'+button('배치하기','place:'+e.id,'primary')+'</div>')).join('')+'</div>':'<div class="inventory-empty"><span>◇</span><h3>보관함이 비어 있습니다</h3><p>구매한 괴이가 이곳에 카드로 들어옵니다.<br>배치된 괴이는 층의 보관 버튼으로 되돌릴 수 있습니다.</p>'+button('블러드 웹 보기','tab:web','primary')+'</div>')+'</div>';
}
function chainCost(node){let cost=0,n=node;while(n){if(!n.bought)cost+=CREATURES[n.type].price;n=game.s.web.nodes.find(x=>x.id===n.parent);}return cost;}
function web(){
 const s=game.s,nodes=s.web.nodes;
 return '<div class="panel-header"><div><span class="eyebrow">THE BLOOD WEB</span><h2>새로운 괴이와의 연결</h2><p class="muted">이전 카드 구매 → 다음 카드 개방 · 같은 종류도 새 개체로 구매</p></div>'+button('웹 리셋 · '+s.resets+'개','resetweb','ghost',!s.resets)+'</div><div class="web-scroll"><div class="web-board"><svg class="web-connections" aria-hidden="true"></svg>'+[1,2,3].map(dep=>'<div class="web-column"><span class="web-level">'+dep+'단계'+(dep===1?' · 즉시 접근':' · 이전 카드 필요')+'</span>'+nodes.filter(n=>n.depth===dep).map(n=>{
 const parent=nodes.find(x=>x.id===n.parent),d=CREATURES[n.type],reason=game.webReason(n.id),locked=parent&&!parent.bought;
 const footer='<div class="card-price">공포 재화 <strong>'+d.price+'</strong><span class="muted">남은 경로 총 '+chainCost(n)+'</span></div><p class="muted prerequisite">'+(n.bought?'✓ 구매 완료':locked?'선행: '+esc(CREATURES[parent.type].name)+' 구매':s.money<d.price?'공포 재화 '+(d.price-s.money)+' 부족':'지금 구매할 수 있습니다')+'</p><div class="card-actions">'+button(n.bought?'구매 완료':'구매하기','buy:'+n.id,'primary',!!reason)+'</div>';
 return '<div data-node="'+n.id+'">'+creatureCard(n.type,null,footer,n.bought?'bought':locked?'locked':'')+'</div>';
 }).join('')+'</div>').join('')+'</div></div>';
}
function management(){
 return '<div class="notice"><strong>'+esc(SERVICES[game.s.round].name)+' 준비</strong><span>생존 괴이는 영업 시작 시 복구됩니다. 빈층을 남기면 탈출구를 열 수 있습니다.</span></div><div class="tabs">'+button('블러드 웹','tab:web','tab '+(tab==='web'?'active':''))+button('보관함 · '+game.s.entities.filter(e=>e.floor==null).length,'tab:inventory','tab '+(tab==='inventory'?'active':''))+'</div><section class="panel management-panel">'+(tab==='web'?web():inventory())+'</section><div class="action-bar"><p class="muted">다음 손님: '+SERVICES[game.s.round].guests.map(id=>esc(GUESTS[id].name)).join(' → ')+'</p>'+button('배치를 마치고 영업 시작','start','primary',!game.s.entities.some(e=>e.floor!=null))+'</div>';
}
function previewPanel(){
 const s=game.s,value=s.phase==='prepare'?s.chosen:hoverDie;
 if(!value)return '<div class="route-preview muted">주사위에 마우스를 올리거나 눌러 이동 경로와 결과를 살펴보세요.</div>';
 try{
 const p=game.preview(value),v=p.state.visitor,killed=p.state.stats.kills>s.stats.kills,escaped=p.state.stats.escaped>s.stats.escaped;
 const changes=s.entities.filter(e=>e.floor).map(e=>{const n=p.state.entities.find(n=>n.id===e.id);if(!n)return '<span class="danger-text">'+e.floor+'층 '+esc(CREATURES[e.type].name)+' 파괴</span>';if(n.c!==e.c||n.p!==e.p)return '<span>'+e.floor+'층 공략도 '+e.c+'→'+n.c+' · 파훼 '+e.p+'→'+n.p+'</span>';return '';}).filter(Boolean);
 return '<div class="route-preview"><div class="route-line">'+p.path.map((f,i)=>'<span class="route-step '+(i===p.path.length-1?'destination':'')+'">'+f+'층 '+(i===p.path.length-1?'도착':'통과')+'</span>').join('<span class="muted">→</span>')+'</div><strong class="'+(p.state.phase==='lost'?'danger-text':'success-text')+'">'+(p.state.phase==='lost'?'이 경로는 패배로 이어집니다':killed?'처치 · 손님 공격 없음':escaped?'탈출 · 현재 영업 종료':'예상 공포 '+v.f+'/'+v.t+' · 남은 심장 '+v.h+' · 불안 '+v.a)+'</strong><div class="attack-preview">'+(changes.length?changes.join(''):!killed&&!escaped?'괴이 파훼 토큰 손실 없음':'현재 손님 처리가 즉시 끝납니다')+'</div>'+(p.uncertainty?.length?'<p class="danger-text">비활동 패널티 예정: 생존 괴이 하나에 무작위 공략도 12. 실제 표적은 아직 정해지지 않았습니다.</p>':'')+'</div>';
 }catch(err){return '<p class="notice">'+esc(err.message)+'</p>';}
}
function battle(){
 const s=game.s,v=s.visitor;
 return '<div class="battle-head"><span class="eyebrow">전투 '+(s.round+1)+'/8 · 손님 '+(s.guestIndex+1)+'/'+SERVICES[s.round].guests.length+' · '+v.turn+'턴</span><span class="badge">'+phaseLabel()+'</span></div><section class="visitor-card"><div class="section-heading"><div><span class="eyebrow">'+(s.round===3?'MID BOSS':s.round===7?'FINAL BOSS':'THE VISITOR')+'</span><h2>'+esc(v.name)+'</h2></div><span class="heart" aria-label="남은 심장 '+v.h+'">'+('♥'.repeat(Math.max(0,v.h)))+'</span></div><div class="stat-grid"><div class="stat-item"><span>공포</span><strong>'+v.f+' / '+v.t+'</strong>'+meter(v.f,v.t)+'</div><div class="stat-item"><span>불안</span><strong>'+v.a+' / 9</strong></div><div class="stat-item"><span>처치 보상</span><strong>공포 재화 '+v.reward+'</strong></div></div><p class="muted">공격 예고 · '+esc(v.attackText||GUESTS[SERVICES[s.round].guests[s.guestIndex]].attackText)+'</p></section><section class="panel dice-panel"><div class="panel-header"><div><span class="eyebrow">CHOOSE YOUR PATH</span><h2>'+({roll:'어디로 안내할까요?',choose:'이동 거리를 선택하세요',prepare:'이동 전 준비를 마치세요',guest_end:'손님을 처치했습니다',service_end:'이번 영업이 끝났습니다'}[s.phase]||'')+'</h2></div></div><div class="panel-body">'+(s.phase==='roll'?'<p class="muted">세 개의 주사위를 굴린 뒤 하나를 골라 이동합니다.</p>':s.dice?.length?'<div class="dice-row">'+s.dice.map((d,i)=>'<button class="die '+((s.phase==='prepare'?s.chosen:hoverDie)===d?'selected':'')+'" data-action="die:'+d+'" data-die="'+d+'" '+(s.phase!=='choose'?'disabled':'')+' aria-label="'+d+'칸 이동">'+d+'<small>'+d+'칸 이동</small></button>').join('')+'</div>':'')+(['choose','prepare'].includes(s.phase)?previewPanel():'')+'<div class="action-bar">'+(s.phase==='roll'?button('주사위 굴리기','roll','primary'):s.phase==='choose'?button((hoverDie?hoverDie+'칸으로 이동 거리 확정':'먼저 주사위를 선택하세요'),'choose','primary',!hoverDie):s.phase==='prepare'?button('탈출구 열어주기','escape','ghost',s.escape!=null||s.entities.filter(e=>e.floor!=null&&e.p>0).length===6)+button('이동 실행','move','primary',!!selection):s.phase==='guest_end'?button('다음 손님 맞이하기','advance','primary'):s.phase==='service_end'?button('정산 확인 · 다음 전투 준비','advance','primary'):'')+'</div></div></section>'+(['roll','choose','prepare'].includes(s.phase)?'<div class="notice '+(s.inactive?'warning':'')+'"><strong>활동 없이 '+s.inactive+'턴</strong><span>'+(s.inactiveLimit-s.inactive)+'턴 더 이어지면 무작위 괴이에 공략도 12 · 충전과 출구 설치는 활동에서 제외</span></div>':'')+logPanel();
}
function logPanel(){return '<section class="panel log-panel"><div class="panel-header"><h3>호텔의 기록</h3><span class="muted">최근 '+Math.min(12,game.s.logs.length)+'개</span></div><ol class="log-list">'+game.s.logs.slice(-12).reverse().map(t=>'<li class="log-entry">'+esc(typeof t==='string'?t:t.text)+'</li>').join('')+'</ol></section>';}
function result(){
 const s=game.s,stats=s.stats;
 return '<section class="result-screen"><span class="eyebrow">END OF THE NIGHT</span><div class="result-emblem">'+(s.phase==='won'?'✧':'◇')+'</div><h1>'+(s.phase==='won'?'마지막 손님이 사라졌다':'호텔의 밤이 끝났다')+'</h1><p>'+esc(s.reason||'모든 영업을 마쳤습니다.')+'</p><div class="result-stats">'+[['도달 전투',(s.round+1)+' / 8'],['처치한 손님',stats.kills+' / 20'],['탈출한 손님',stats.escaped],['미등장 손님',stats.skipped],['획득 공포 재화',stats.earned],['사용한 재화',stats.spent],['파괴된 괴이',stats.destroyed]].map(([k,v])=>'<div><span>'+k+'</span><strong>'+v+'</strong></div>').join('')+'</div><div class="title-actions">'+button('새 판 시작','new','primary')+button('타이틀로','backtitle','ghost')+'</div><p class="muted">난수 번호 '+esc(s.seed)+' · 옵션과 설명 확인 이력은 유지됩니다.</p></section>'+logPanel();
}
function title(){
 return '<main class="title-screen"><div class="title-copy"><span class="eyebrow">DREAD TO DEAD · FEARS GO ROUND</span><h1>어서 오세요.<br>출구는<br><em>위층에 있습니다.</em></h1><p>손님을 두렵게 하고, 괴이를 연결하고,<br>끝없이 돌아가는 호텔을 설계하세요.</p><div class="title-actions">'+button('호텔 영업 시작','new','primary')+(game?button('진행 중인 판으로','resume','ghost'):'')+button('플레이 안내','help','ghost')+'</div><div class="title-facts"><span>6층의 호텔</span><span>8번의 전투</span><span>마지막 보스를 처치하세요</span></div></div><div class="title-art" aria-hidden="true"><div class="hotel-sign">HOTEL<br><small>NO VACANCY</small></div>'+[6,5,4,3,2,1].map((f,i)=>'<div class="mini-floor"><span>'+String(f).padStart(2,'0')+'</span><i class="shape" data-type="'+['G','Q','E','Q','B','U'][i]+'"></i><span class="mini-window"></span><span class="mini-window"></span></div>').join('')+'<div class="art-caption">THE WAY UP IS THE WAY BACK.</div></div><button class="button ghost title-options" data-action="options">옵션</button></main>';
}
let onTitle=true;
function render(){
 hideTip();pinned=null;const active=document.activeElement?.dataset?.action;
 $('#app').innerHTML=onTitle?title():header()+'<main class="game-layout">'+hotel()+'<div class="workspace">'+(selection?'<div class="selection-banner"><span>'+esc(selection.kind==='place'?'배치할 층을 선택하세요':selection.kind==='escape'?'탈출구를 설치할 빈층을 선택하세요':selection.kind==='G'?'보호할 괴이가 있는 층을 선택하세요':'공략도를 낮출 괴이가 있는 층을 선택하세요')+'</span>'+button('선택 취소','cancel','small ghost')+'</div>':'')+(game.s.phase==='management'?management():['won','lost'].includes(game.s.phase)?result():battle())+'</div></main>';
 if(active)$$('[data-action]').find(e=>e.dataset.action===active)?.focus({preventScroll:true});
 document.body.classList.toggle('resolving',busy);drawWeb();renderModal();
}
function drawWeb(){const svg=$('.web-connections');if(!svg)return;const board=$('.web-board');requestAnimationFrame(()=>{if(!svg.isConnected)return;const rect=board.getBoundingClientRect();svg.setAttribute('width',board.scrollWidth);svg.setAttribute('height',board.scrollHeight);svg.innerHTML=game.s.web.nodes.filter(n=>n.parent!=null).map(n=>{const p=board.querySelector('[data-node="'+n.parent+'"]'),c=board.querySelector('[data-node="'+n.id+'"]');if(!p||!c)return '';const a=p.getBoundingClientRect(),b=c.getBoundingClientRect(),x=a.right-rect.left,y=a.top+a.height/2-rect.top,xx=b.left-rect.left,yy=b.top+b.height/2-rect.top;return '<path d="M '+x+' '+y+' C '+(x+24)+' '+y+', '+(xx-24)+' '+yy+', '+xx+' '+yy+'" class="'+(game.s.web.nodes.find(q=>q.id===n.parent).bought?'unlocked':'')+'"/>';}).join('');});}
function renderModal(){
 const root=$('#modal-root');if(!modal){root.innerHTML='';document.body.classList.remove('has-modal');return;}
 let body='',footer='',title='',wide=false;
 if(modal.type==='tutorial'){[title,body]=tutorial[modal.key];body='<p>'+esc(body)+'</p>';footer=button('앞으로 설명 끄기','tutorialoff','ghost')+button('확인','tutorialnext','primary');}
 if(modal.type==='options'){title='옵션';body='<label class="settings-row"><span>처음 보는 시스템 설명 팝업</span><input type="checkbox" data-setting="tutorial" '+(prefs.tutorial?'checked':'')+'></label><label class="settings-row"><span>연출 속도</span><select data-setting="speed"><option value="normal" '+(prefs.speed==='normal'?'selected':'')+'>보통</option><option value="fast" '+(prefs.speed==='fast'?'selected':'')+'>빠름</option></select></label><p class="muted">설명 팝업을 꺼도 괴이 카드와 호버 정보는 항상 볼 수 있습니다.</p>'+button('설명 확인 이력 초기화','resettutorial','ghost');footer=(!onTitle&&!['won','lost'].includes(game?.s.phase)?button('이번 판 포기','surrenderconfirm','danger'):button('새 판 시작','newconfirm','ghost'))+button('돌아가기','closemodal','primary');}
 if(modal.type==='help'){title='호텔 운영 안내';wide=true;body='<p>구매·배치 → 일반 영업 세 번 → 보스 → 다시 일반 영업 세 번 → 최종 보스. 일반 영업은 손님 세 명을 연속으로 상대합니다.</p><div class="help-topics">'+Object.entries(tutorial).map(([key,[title,text]])=>'<details data-topic="'+key+'"><summary>'+esc(title)+'</summary><p>'+esc(text)+'</p></details>').join('')+'</div><h3>괴이 사전</h3><div class="card-grid">'+Object.keys(CREATURES).map(t=>creatureCard(t)).join('')+'</div>';footer=button('닫기','closemodal','primary');}
 if(modal.type==='roadmap'){title='앞으로 찾아올 손님';wide=true;body=SERVICES.map((r,i)=>'<section class="roadmap-service"><h3>'+(i+1)+'/8 · '+esc(r.name)+'</h3>'+r.guests.map(id=>{const g=GUESTS[id];return '<p><strong>'+esc(g.name)+'</strong> · 공포 한계 '+g.t+' · 남은 심장 '+g.h+' · 보상 '+g.reward+'<br><span class="muted">'+esc(g.attackText)+'</span></p>';}).join('')+'</section>').join('');footer=button('닫기','closemodal','primary');}
 if(modal.type==='confirm'){title=modal.title;body='<p>'+esc(modal.text)+'</p>';footer=button('취소','closemodal','ghost')+button('확정',modal.action,'danger');}
 root.innerHTML='<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="'+esc(title)+'" class="modal '+(wide?'wide':'')+'"><div class="modal-header"><span class="eyebrow">'+(modal.type==='tutorial'?'HOTEL GUIDE':'DREAD TO DEAD')+'</span><h2>'+esc(title)+'</h2></div><div class="modal-body">'+body+'</div><div class="modal-footer">'+footer+'</div></section></div>';
 document.body.classList.add('has-modal');requestAnimationFrame(()=>root.querySelector('button.primary,button')?.focus({preventScroll:true}));
}
function hideTip(){clearTimeout(tipTimer);clearTimeout(tipClose);$('#tooltip').hidden=true;}
function showTip(id,pin=false){
 const e=entity(id);if(!e)return;pinned=pin?id:null;const box=$('[data-floor="'+e.floor+'"]'),tip=$('#tooltip');if(!box)return;
 let forecast='';
 if(selection&&['G','R'].includes(selection.kind)&&validFloor(e.floor)){
  const c=game.clone();c.active(selection.id,e.id);const prepared=c.s.entities.find(n=>n.id===e.id);const after=c.preview(c.s.chosen);const final=after.state.entities.find(n=>n.id===e.id);
  forecast='<div class="target-forecast"><strong>이 층을 선택하면</strong><p>'+(selection.kind==='G'?'이번 턴 보호 '+(e.shield||0)+' → '+prepared.shield:'공략도 '+e.c+' → '+prepared.c+' · 불안 '+game.s.visitor.a+' → '+c.s.visitor.a)+'</p><p>이동·공격 후: '+(final?'공략도 '+final.c+'/12 · 파훼 토큰 '+final.p:'괴이 파괴')+'</p>'+(after.uncertainty?.length?'<small>무작위 비활동 패널티 이전 예상입니다.</small>':'')+'</div>';
 }else if(e.type==='B'&&!game.activeReason(e.id)){
  const c=game.clone();c.active(e.id);forecast='<div class="target-forecast"><strong>공포 6 주기를 누르면</strong><p>'+(c.s.stats.kills>game.s.stats.kills?'즉시 처치 · 공포 재화 '+game.s.visitor.reward+' · 손님 공격 취소':'공포 '+game.s.visitor.f+' → '+c.s.visitor.f+' · 남은 심장 '+game.s.visitor.h+' → '+c.s.visitor.h)+'</p><small>남은 사용 '+e.uses+' → '+(e.uses-1)+'회</small></div>';
 }
 tip.innerHTML=creatureCard(e.type,e,forecast)+(pin?button('정보 닫기','closetip','small ghost'):'');tip.hidden=false;
 const rect=box.getBoundingClientRect(),w=Math.min(330,innerWidth-24);tip.style.width=w+'px';tip.style.left=(rect.right+12+w<innerWidth?rect.right+12:Math.max(12,rect.left-w-12))+'px';tip.style.maxHeight=(innerHeight-24)+'px';tip.style.overflowY='auto';
 const height=Math.min(tip.offsetHeight,innerHeight-24);
 const ys=[Math.max(12,Math.min(rect.top,innerHeight-height-12)),12,Math.max(12,innerHeight-height-12)];
 const xs=[Math.min(rect.right+12,innerWidth-w-12),Math.max(12,innerWidth-w-12)];
 const controls=$$('.workspace .die,.workspace .action-bar button,.floor-actions button').map(n=>n.getBoundingClientRect());
 let best=null;for(const x of xs)for(const y of ys){let score=0;for(const r of controls)score+=Math.max(0,Math.min(x+w,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+height,r.bottom)-Math.max(y,r.top));if(!best||score<best.score)best={x,y,score};}
 tip.style.left=best.x+'px';tip.style.top=best.y+'px';
}
function toast(text){let el=$('.toast');if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=text;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3600);}
function finishAction(before){
 const s=game.s;
 render();
 if(s.stats.destroyed>(before?.destroyed||0))teach('destroyed');
 if(s.stats.kills>(before?.kills||0)&&s.phase==='guest_end')teach('boundary');
 if(s.resets>(before?.resets??s.resets))teach('reset');
 if(s.inactive>0)teach('idle');
 if(s.phase==='management'&&s.round===3)teach('boss');
 if(s.phase==='management'&&s.round===7)teach('final');
 showNextTutorial();
}
async function moveAnimated(){
 busy=true;hideTip();document.body.classList.add('resolving');const before={...game.s.stats,resets:game.s.resets};game.move();
 const events=game.events||[];
 for(const ev of events.filter(e=>e.floor)){
  while(modal)await new Promise(r=>setTimeout(r,100));
  const floor=$('[data-floor="'+ev.floor+'"]');floor?.classList.add('attacked');toast(ev.text);await new Promise(r=>setTimeout(r,prefs.speed==='fast'?55:170));floor?.classList.remove('attacked');
 }
 busy=false;hoverDie=null;selection=null;finishAction(before);
}
function newGame(){game=new Game(crypto.getRandomValues(new Uint32Array(1))[0]);onTitle=false;selection=null;hoverDie=null;tab='web';modal=null;queue=[];busy=false;render();teach('hotel','coins','web');}
async function action(name){
 const [a,...rest]=name.split(':'),id=rest.join(':');
 if(busy&&!['options','closemodal'].includes(a))return;
 const before=game?{...game.s.stats,resets:game.s.resets}:null;
 try{
 if(a==='new'){newGame();return;}
 if(a==='newconfirm'){modal={type:'confirm',title:'새 판을 시작할까요?',text:'현재 진행과 자산은 사라집니다. 옵션과 설명 확인 이력은 유지됩니다.',action:'new'};renderModal();return;}
 if(a==='resume'){onTitle=false;render();return;}
 if(a==='backtitle'){onTitle=true;render();return;}
 if(a==='title'){modal={type:'confirm',title:'타이틀로 돌아갈까요?',text:'이 화면을 닫지 않으면 진행 중인 판으로 다시 돌아올 수 있습니다.',action:'gotitle'};renderModal();return;}
 if(a==='gotitle'){modal=null;onTitle=true;render();return;}
 if(['options','help','roadmap'].includes(a)){modal={type:a};hideTip();renderModal();return;}
 if(a==='closemodal'){modal=null;renderModal();showNextTutorial();return;}
 if(a==='tutorialnext'){seen[modal.key]=true;save();modal=null;renderModal();showNextTutorial();return;}
 if(a==='tutorialoff'){prefs.tutorial=false;queue=[];save();modal=null;renderModal();return;}
 if(a==='resettutorial'){seen={};save();toast('설명 확인 이력을 초기화했습니다. 다음 관련 기능에서 다시 안내합니다.');return;}
 if(a==='surrenderconfirm'){modal={type:'confirm',title:'이번 판을 포기할까요?',text:'현재 판은 패배로 끝납니다. 다음 판은 초기 자산으로 시작합니다.',action:'surrender'};renderModal();return;}
 if(a==='surrender'){game.surrender();modal=null;queue=[];render();return;}
 if(a==='tab'){tab=id;selection=null;render();teach(id==='inventory'?'cards':'web');return;}
 if(a==='buy'){game.buy(id);tab='inventory';render();teach('cards');toast('구매 완료 · 보관함 카드에서 배치하기를 누르세요.');return;}
 if(a==='resetweb'){game.resetWeb();render();return;}
 if(a==='place'){selection={kind:'place',id:entity(id).id};render();return;}
 if(a==='store'){game.store(entity(id).id);render();return;}
 if(a==='cancel'){selection=null;render();return;}
 if(a==='info'){showTip(id,true);teach(['G','E','R'].includes(entity(id).type)?entity(id).type:'cards');return;}
 if(a==='closetip'){pinned=null;hideTip();return;}
 if(a==='start'){selection=null;game.startService();hoverDie=null;render();teach('fear','attack');return;}
 if(a==='roll'){game.roll();hoverDie=null;render();teach('dice');return;}
 if(a==='die'){if(game.s.phase==='choose'){hoverDie=Number(id);render();}return;}
 if(a==='choose'){game.choose(hoverDie);hoverDie=null;render();teach('route','anxiety');if(game.path(game.s.chosen).some((f,i,ar)=>i&&f<ar[i-1]))teach('loop');if(game.s.entities.some(e=>!game.activeReason(e.id)))teach('active');return;}
 if(a==='active'){const e=entity(id);if(e.type==='B'){game.active(e.id);finishAction(before);}else{selection={kind:e.type,id:e.id};render();teach('target',e.type);}return;}
 if(a==='escape'){selection={kind:'escape'};render();teach('escape');return;}
 if(a==='move'){await moveAnimated();return;}
 if(a==='advance'){game.advance();selection=null;hoverDie=null;finishAction(before);if(game.s.phase==='management')teach('reset');return;}
 }catch(err){busy=false;document.body.classList.remove('resolving');toast(err.message);console.error(err);}
}
document.addEventListener('click',ev=>{
 const el=ev.target.closest('[data-action]');if(el){ev.preventDefault();if(modal&&!el.closest('#modal-root'))return;if(!el.disabled)action(el.dataset.action);return;}
 const floor=ev.target.closest('[data-floor]');if(!floor||modal||busy)return;const f=Number(floor.dataset.floor);
 if(selection){if(!validFloor(f)){toast('이 층은 현재 선택의 대상이 아닙니다.');return;}try{
 const before={...game.s.stats,resets:game.s.resets};
 if(selection.kind==='place'){const occupying=at(f),source=entity(selection.id);if(occupying&&occupying.id!==source.id&&source.floor==null){modal={type:'confirm',title:'교체 배치할까요?',text:f+'층의 '+CREATURES[occupying.type].name+'은 보관함으로 돌아갑니다.',action:'confirmplace:'+f};renderModal();return;}game.place(selection.id,f);}
 else if(selection.kind==='escape')game.installEscape(f);
 else game.active(selection.id,at(f).id);
 selection=null;finishAction(before);
 }catch(e){toast(e.message);}return;}
 if(floor.dataset.entity)showTip(floor.dataset.entity,true);
});
const baseAction=action;
action=async function(name){if(name.startsWith('confirmplace:')){try{game.place(selection.id,Number(name.split(':')[1]));selection=null;modal=null;render();}catch(e){toast(e.message);}return;}return baseAction(name);};
document.addEventListener('pointerover',ev=>{
 if(modal||busy||onTitle)return;
 const die=ev.target.closest('[data-die]');if(die&&game.s.phase==='choose'){const n=Number(die.dataset.die);if(n!==hoverDie){hoverDie=n;const panel=$('.route-preview');if(panel)panel.outerHTML=previewPanel();const confirm=$('[data-action="choose"]');if(confirm){confirm.disabled=false;confirm.textContent=n+'칸으로 이동 거리 확정';}$$('.floor').forEach(f=>{const path=game.path(n);f.classList.toggle('arrival',Number(f.dataset.floor)===path.at(-1));f.classList.toggle('transit',path.includes(Number(f.dataset.floor))&&Number(f.dataset.floor)!==path.at(-1));});}return;}
 const floor=ev.target.closest('[data-entity]');if(floor&&!floor.contains(ev.relatedTarget)&&!pinned){clearTimeout(tipClose);clearTimeout(tipTimer);tipTimer=setTimeout(()=>showTip(floor.dataset.entity),150);}
 if(ev.target.closest('#tooltip'))clearTimeout(tipClose);
});
document.addEventListener('pointerout',ev=>{if(!pinned&&(ev.target.closest('[data-entity]')||ev.target.closest('#tooltip'))){clearTimeout(tipTimer);tipClose=setTimeout(hideTip,180);}});
document.addEventListener('focusin',ev=>{const floor=ev.target.closest('[data-entity]');if(floor&&ev.target===floor&&!modal)showTip(floor.dataset.entity);});
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'){ev.preventDefault();if(modal?.type==='tutorial')action('tutorialnext');else if(modal)action('closemodal');else if(selection){selection=null;render();}else if(!$('#tooltip').hidden){pinned=null;hideTip();}else action('options');}
 if(ev.key==='Enter'&&ev.target.matches('[data-floor]'))ev.target.click();
 if(modal&&ev.key==='Tab'){const els=[...$('#modal-root').querySelectorAll('button,input,select,summary,[tabindex]')].filter(x=>!x.disabled);const first=els[0],last=els.at(-1);if(ev.shiftKey&&document.activeElement===first){last?.focus();ev.preventDefault();}else if(!ev.shiftKey&&document.activeElement===last){first?.focus();ev.preventDefault();}}
});
document.addEventListener('contextmenu',ev=>{if(selection){ev.preventDefault();selection=null;render();}});
document.addEventListener('change',ev=>{if(ev.target.dataset.setting==='tutorial'){prefs.tutorial=ev.target.checked;if(!prefs.tutorial)queue=[];save();}if(ev.target.dataset.setting==='speed'){prefs.speed=ev.target.value;save();}});
document.addEventListener('toggle',ev=>{if(ev.target.dataset?.topic&&ev.target.open){seen[ev.target.dataset.topic]=true;save();}},true);
addEventListener('resize',()=>{drawWeb();if(pinned)showTip(pinned,true);});
render();
