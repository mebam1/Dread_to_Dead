import {Game,CREATURES,GUESTS,SERVICES,DICE} from './engine.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
let prefs=read('dread-user2-options',read('dread-user1-options',{tutorial:true,speed:'normal'})),seen={...read('dread-user1-seen',{}),...read('dread-user2-seen',{})};
const save=()=>{try{localStorage.setItem('dread-user2-options',JSON.stringify(prefs));localStorage.setItem('dread-user2-seen',JSON.stringify(seen));}catch{}};
let game=null, tab='web', selection=null, hoverDie=null, modal=null, queue=[],busy=false,tipTimer,tipClose,pinned=null;
let selectedSeed=21001,rewardType=null,rewardSlot=null,expansion={position:0,slot:0,face:0,anxiety:0,fear:0},previewOpen=false,rendering=false,renderedScene=null;
const tutorial={
 hotel:['당신의 호텔을 설계하세요','층마다 괴이를 하나 배치합니다. 손님은 위로 이동하며, 맨 위 다음에는 다시 1층으로 돌아옵니다. 먼저 카드의 효과와 다음 손님을 살펴보세요.'],
 cards:['괴이는 카드로 보관됩니다','블러드 웹에서 구매한 괴이는 보관함에 카드로 들어옵니다. 배치하기를 누른 다음 층을 선택하세요. 층에 마우스를 올리면 같은 상세 카드를 볼 수 있습니다.'],
 web:['괴이를 구매하는 블러드 웹','연결된 이전 카드를 구매하면 다음 카드가 열립니다. 카드는 한 번만 구매할 수 있지만, 같은 이름의 다른 카드는 별도로 살 수 있습니다.'],
 coins:['공포와 공포 재화는 달라요','보유 공포 재화는 괴이를 사는 돈입니다. 손님에게 쌓는 공포는 공격 수치이며, 손님을 처치했을 때에만 고정 보상을 받습니다.'],
 dice:['세 눈 중 하나를 선택하세요','각 눈이 이동할 층 수입니다. 마우스를 올리거나 한 번 눌러 경로와 예상 공격을 살펴본 다음 이동 거리를 확정하세요.'],
 route:['통과와 도착은 다른 효과입니다','중간층은 통과 효과만, 마지막 층은 도착 효과만 발동합니다. 도착층의 통과 효과는 함께 발동하지 않습니다.'],
 loop:['꼭대기 다음은 다시 1층','호텔 꼭대기를 넘어가면 1층으로 돌아옵니다. 한 바퀴를 돌아도 손님의 공포와 불안은 남습니다.'],
 fear:['공포를 쌓아 심장을 없애세요','공포가 한계에 닿으면 남은 심장 하나가 줄고 공포는 0이 됩니다. 마지막 심장을 없애면 처치하며 손님의 반격도 사라집니다.'],
 anxiety:['불안을 공급하고 수확하세요','문틈의 속삭임이 만든 불안을 이름을 부르는 객실이 소비해 공포로 바꿉니다. 불안은 최대 9이며 다음 손님에게 넘겨지지 않습니다.'],
 attack:['괴이도 공격을 받습니다','손님의 공격은 괴이의 공략도를 올립니다. 한계 12에 닿으면 공략도는 0이 되고 파훼 토큰 하나를 잃습니다. 토큰이 0이면 영구 파괴됩니다.'],
 active:['직접 사용은 해당 층에서','이동 거리를 확정한 뒤, 이동하기 전에 층 안의 버튼을 누르세요. 횟수와 자원이 남으면 같은 턴에 여러 번 사용할 수 있습니다.'],
 target:['효과를 받을 층을 선택하세요','강조된 층이 유효한 대상입니다. 대상을 고르기 전에는 비용을 쓰지 않습니다. 취소 버튼이나 ESC로 돌아갈 수 있습니다.'],
 G:['보호와 충전을 구별하세요','닫히지 않는 방화문의 직접 사용은 이번 턴 공략도 6을 막습니다. 도착 효과는 방어 횟수 1 충전이며, 새 충전분은 다음 턴부터 쓸 수 있습니다.'],
 E:['이미 있는 불안을 증폭합니다','따라오는 발자국을 통과하면 현재 불안만큼 불안이 늘어납니다. 불안 전체 상한은 9이며, 불안이 0일 때는 증폭도 없습니다.'],
 R:['수리는 불안을 소비합니다','벽을 꿰매는 그림자는 불안 2를 써서 공략도를 최대 6 낮춥니다. 파훼 토큰이나 파괴된 괴이는 복구하지 않습니다.'],
 idle:['아무 활동 없이 버티면 위험해요','공포·불안 부여나 직접 사용 없이 3턴이면 무작위 괴이에 공략도 12가 더해집니다. 계속 비활동이면 이후 2턴마다 반복합니다. 충전과 탈출구 설치만으로는 활동이 되지 않습니다.'],
 escape:['출구를 열고 실제로 지나가야 해요','빈층에 출구를 설치한 뒤 손님이 통과하거나 도착하면 영업이 끝납니다. 이미 처치한 보상은 유지하지만 탈출 손님과 남은 손님은 무보상입니다.'],
 destroyed:['파괴된 괴이는 돌아오지 않습니다','파훼 토큰이 0이 된 괴이는 사라지고 빈층이 됩니다. 다른 구매 카드에서 같은 종류를 새로 살 수 있습니다. 배치된 괴이가 전멸하면 즉시 패배합니다.'],
 boundary:['같은 영업의 다음 손님','괴이의 공략도는 0이 되지만 파훼 토큰과 남은 사용 횟수는 유지합니다. 세 손님을 상대할 자원을 나누어 쓰세요.'],
 reset:['영업 종료와 리셋권','영업 종료마다 웹 리셋권 하나를 얻습니다. 자동 갱신은 하지 않으며, 권리를 써야 새 웹이 나옵니다. 다음 영업 시작 때 살아남은 괴이의 토큰과 횟수가 복구됩니다.'],
 boss:['이번에는 보스 한 명','보스의 공격 패턴과 남은 심장 수를 확인하고 배치를 준비하세요. 중간 보스를 탈출시켜도 다음 구간으로 진행할 수 있습니다.'],
 final:['마지막 보스를 처치하세요','호텔의 조사관을 처치하면 승리합니다. 마지막 보스를 탈출시키면 패배합니다.'],
 expansion:['꼭대기에 빈층을 더할 수 있어요','공포 재화로 꼭대기에 빈층 하나를 추가합니다. 기존 층은 그대로지만 순환 경로가 달라지니 확정 전에 비교해 보세요.'],
 expansionCompare:['같은 눈으로 경로를 비교하세요','같은 위치와 같은 주사위로도 도착층이 달라집니다. 비용과 남을 재화, 새 경로를 함께 확인하세요.'],
 reward:['보스의 주사위를 고르세요','세 후보 중 하나를 받거나 건너뛸 수 있습니다. 받으면 기존 주사위 하나를 교체하고 총 세 개는 유지합니다.'],
 longRoute:['한 바퀴보다 멀리 갈 수 있어요','같은 층을 다시 지나면 효과와 경로 공격도 방문마다 계산합니다. 길어진 경로의 이득과 받을 공격을 함께 확인하세요.'],
 diceEffect:['같은 3도 다른 선택입니다','불안 주사위의 3을 확정하면 이동 전에 불안 1을 얻습니다. 일반 주사위의 3과 이름·효과·예고를 비교하세요.'],
 diceApplied:['선택 효과가 적용되었습니다','선택 효과로 얻은 불안은 지금 직접 사용 비용에도 쓸 수 있습니다. 호버나 다시 미리보기로 효과가 반복되지는 않습니다.'],
 concise:['고유 효과와 공통 규칙','카드에는 고유 효과를 짧게 보여줍니다. 밑줄 친 용어로 공통 규칙을, 상세 보기로 효과 없는 항목까지 확인하세요.'],
 summary:['요약을 보고 과정을 펼쳐 보세요','도착·공포·심장·손실을 먼저 비교하세요. 과정을 펼치면 선택 효과부터 개별 공격까지 순서대로 볼 수 있습니다.']
};
const glossary={
 '통과':'이동의 중간 방문입니다. 한 방문에는 통과와 도착 중 하나만 발동합니다.',
 '도착':'이동의 마지막 방문입니다. 도착한 층의 통과 효과는 함께 발동하지 않습니다.',
 '불안':'손님마다 0~9이며 자연 감소하지 않습니다. 효과로 소비되거나 손님 종료 때 정리됩니다.',
 '수확':'지정량까지 실제 불안을 소비해 공포로 전환합니다. 최대량·배율·한 번 부여 여부는 각 카드 본문을 따릅니다.',
 '보호':'개별 타격 순서대로 공략도를 흡수합니다. 같은 대상에 합산되며 공격 뒤 또는 손님 종료 때 남은 보호는 사라집니다. 시전 괴이가 파괴돼도 이미 부여한 보호는 유지됩니다.',
 '충전':'방어의 남은 사용 횟수를 1 늘립니다. 최대 2회이며 도착으로 새로 얻은 충전은 다음 턴부터 사용할 수 있습니다.',
 '심장마비':'한 번의 공포 효과가 공포 한계에 닿으면 심장 하나를 제거하고 공포를 0으로 만듭니다. 초과 공포는 사라집니다. 심장이 남으면 반격합니다.',
 '공략도':'개별 공격이 쌓이는 값입니다. 한계 12에 닿으면 파훼 토큰 하나를 잃고 0이 됩니다. 한 타격의 초과 공략도는 사라집니다.',
 '파훼 토큰':'괴이의 남은 내구입니다. 0이면 그 개체는 영구 파괴되어 즉시 빈층이 됩니다. 새 영업 시작 때 생존 괴이만 초기값으로 복구됩니다.'
};
function term(label){return '<button class="term" type="button" data-action="term:'+esc(label)+'" title="'+esc(glossary[label])+'">'+esc(label)+'</button>';}
function keywordText(text){return esc(text).replace(/파훼 토큰|심장마비|공략도|불안|수확|보호|충전|통과|도착/g,key=>term(key));}
function teach(...keys){if(!prefs.tutorial)return;for(const key of keys)if(tutorial[key]&&!seen[key]&&!queue.includes(key))queue.push(key);showNextTutorial();}
function showNextTutorial(){if(!modal&&queue.length&&!busy){modal={type:'tutorial',key:queue.shift()};renderModal();}}
function button(text,action,extra='',disabled=false){return '<button class="button '+extra+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+text+'</button>';}
function entity(id){return game.s.entities.find(e=>String(e.id)===String(id));}
function at(floor){return game.s.entities.find(e=>e.floor===floor&&e.p>0);}
function shape(type){return '<span class="shape" data-type="'+type+'" aria-hidden="true"></span>';}
function meter(value,max,color=''){return '<span class="meter"><span class="fill '+color+'" style="width:'+Math.min(100,value/max*100)+'%"></span></span>';}
const cardEffects={
 U:[['통과','손님 불안 +2.'],['도착','손님 불안 +4.']],
 Q:[['도착','불안 최대 3 수확 → 소비 1당 공포 4, 최대 12를 한 번에 부여.']],
 B:[['도착','손님 공포 +3.'],['직접 사용','손님 공포 +3.']],
 G:[['도착','방어 1회 충전. 최대 2회, 다음 턴부터 사용.'],['직접 사용','살아 있는 배치 괴이 하나에 이번 턴 보호 6. 자신도 선택 가능.']],
 E:[['통과','현재 불안만큼 추가. 불안 0이면 증가 없음.'],['도착','손님 불안 +1.']],
 R:[['직접 사용','살아 있는 배치 괴이 하나의 공략도 최대 6 수리. 공략도가 있는 대상 필요, 자신도 선택 가능.']]
};
function effects(type){
 const rows=cardEffects[type];
 return '<div class="effect-list">'+rows.map(([key,text])=>'<div><span class="effect-label">'+(glossary[key]?term(key):key)+'</span><p>'+keywordText(text)+'</p></div>').join('')+'</div><details class="card-details"><summary>상세 보기 · 모든 효과</summary><div class="effect-list">'+['통과','도착','직접 사용'].map(key=>'<div><span class="effect-label">'+key+'</span><p>'+keywordText(rows.find(r=>r[0]===key)?.[1]||'효과 없음')+'</p></div>').join('')+'</div></details>';
}
function creatureCard(type,e=null,footer='',extra=''){
 const d=CREATURES[type],own=game?.s.entities.filter(x=>x.type===type).length||0,v=game?.s.visitor;
 let current='';
 if(v&&['roll','choose','prepare'].includes(game.s.phase)){
  const now=type==='U'?'통과 +'+Math.min(2,9-v.a)+' · 도착 +'+Math.min(4,9-v.a):type==='E'?'통과 +'+Math.min(v.a,9-v.a)+' · 도착 +'+Math.min(1,9-v.a):type==='Q'?'불안 '+Math.min(3,v.a)+' 수확 → 공포 '+Math.min(3,v.a)*4:type==='R'?'현재 불안 '+v.a+' / 비용 2':'';
  if(now)current='<p class="card-current"><small>지금 불안만으로 계산</small><br>'+now+'</p>';
 }
 const costs=(type==='B'||type==='G')?'<div>비용: 사용 1회 · 남은 사용: <strong>'+(e?e.uses:2)+'/2회</strong><br><small>새 영업 시작 시 2회로 복구</small></div>':type==='R'?'<div>비용: 불안 2 · 별도 횟수 소모 없음</div>':'';
 return '<article class="card creature-card '+extra+'" data-type="'+type+'"><div class="card-top">'+shape(type)+'<span class="card-role">'+esc(d.role)+'</span></div><h3 class="card-title">'+esc(d.name)+'</h3>'+effects(type)+'<div class="card-stats"><div>'+term('공략도')+' <strong>'+(e?e.c:0)+'/12</strong> · '+term('파훼 토큰')+' <strong>'+(e?e.p:d.maxP)+'/'+d.maxP+'</strong></div>'+costs+(e?.shield?'<div>이번 턴 '+term('보호')+' '+e.shield+'</div>':'')+'</div>'+current+(!e?'<div class="muted">현재 같은 종류 '+own+'개 보유</div>':'<div class="muted">'+(e.floor?e.floor+'층에 배치됨':'보관 중')+' · 개체 '+esc(e.id.replace('e',''))+(game.s.phase==='management'?' · 영업 시작 시 생존 괴이 복구':'')+'</div>')+footer+'</article>';
}
function phaseLabel(){if(busy)return '이동·공격 처리 중';return {management:'구매와 배치',roll:'주사위 굴리기',choose:'이동 거리 선택',prepare:'이동 전 준비',guest_end:'손님 처치',service_end:'영업 정산',reward:'보스 주사위 보상',won:'호텔의 승리',lost:'영업 종료'}[game.s.phase]||'';}
function header(){
 const s=game.s;
 return '<header class="topbar"><a href="#" class="brand" data-action="title"><span class="brand-mark">◈</span><span>DREAD TO DEAD<small>FEARS GO ROUND</small></span></a><div class="resources"><div class="resource"><span>보유 공포 재화</span><strong>'+s.money+'</strong></div><div class="resource"><span>웹 리셋권</span><strong>'+s.resets+'<small> 개</small></strong></div></div><div class="top-actions">'+button('손님 목록','roadmap','ghost small')+button('도움말','help','ghost small')+button('옵션','options','ghost small')+'</div></header><nav class="progress-strip" aria-label="전투 진행">'+SERVICES.map((r,i)=>'<span class="stage '+(i===s.round?'current':i<s.round?'done':'')+'">'+(i<s.round?'✓ ':i+1+'. ')+esc(r.name)+'</span>').join('')+'</nav>';
}
function shortEffect(type){return {U:'통과: 불안 +2 · 도착: 불안 +4',Q:'도착: 불안 최대 3 → 공포 최대 12',B:'도착: 공포 +3 · 직접 사용: 공포 +3',G:'도착: 방어 횟수 +1 · 직접 사용: 보호 6',E:'통과: 현재 불안만큼 추가 · 도착: 불안 +1',R:'직접 사용: 불안 2 → 공략도 최대 −6'}[type];}
function activeButton(e){
 if(!['B','G','R'].includes(e.type))return '';
 let reason=game.activeReason(e.id);
 if(reason)return '<span class="muted active-reason">'+esc(reason)+'</span>';
 return button(e.type==='B'?'공포 3 주기 · '+e.uses+'회':e.type==='G'?'보호하기 · '+e.uses+'회':'공략도 줄이기 · 불안 2','active:'+e.id,'small');
}
function validFloor(floor){
 if(!selection)return false;const e=at(floor);
 if(selection.kind==='place')return true;
 if(selection.kind==='escape')return !e;
 if(selection.kind==='G')return !!e;
 if(selection.kind==='R')return !!e&&e.c>0;
 return false;
}
function currentPreview(){
 if(!game||!['choose','prepare'].includes(game.s.phase))return null;
 if(game.s.phase==='choose'&&hoverDie==null)return null;
 return game.preview(game.s.phase==='choose'?hoverDie:undefined);
}
function previewHits(p,floor){return (p?.attacks||p?.events?.filter(e=>e.kind==='attack')||[]).filter(e=>e.floor===floor);}
function floorThreat(p,e,floor){
 if(!p)return '';
 const hit=previewHits(p,floor),after=e&&p.state.entities.find(n=>n.id===e.id),lost=e?(after?Math.max(0,e.p-after.p):e.p):0;
 if(!hit.length)return '';
 const amounts=hit.map(h=>h.amount??h.power??h.attack??h.raw??0);
 const attackText=amounts.every(n=>n===amounts[0])?'공략도 '+amounts[0]+(amounts.length>1?' × '+amounts.length:''):'공략도 '+amounts.join(' → ');
 const consequence=e?(!after?'이번 공격으로 파괴':lost?'파훼 토큰 '+lost+'개 소모 예상':'토큰 소모 없음'):'빈층 · 피해 없음';
 return '<details class="floor-threat '+(lost?'danger-text':'')+'"><summary>'+attackText+' · '+consequence+'</summary><ol>'+hit.map((h,i)=>'<li>'+esc(h.text||((i+1)+'번째 타격 · 공략도 '+amounts[i]+' · 보호 흡수 '+(h.absorbed??0)))+'</li>').join('')+'</ol></details>';
}
function hotel(){
 const s=game.s,p=currentPreview(),path=p?.path||[],dest=path.at(-1),floors=Array.from({length:s.floorCount},(_,i)=>s.floorCount-i);
 return '<aside class="hotel-panel"><div class="section-heading"><div><span class="eyebrow">THE HOTEL · USER 2</span><h2>끝나지 않는 층</h2></div><span class="badge">'+s.floorCount+'층 호텔</span></div><nav class="floor-nav" aria-label="층 바로가기">'+floors.map(f=>{const e=at(f),after=e&&p?.state.entities.find(n=>n.id===e.id),risk=e&&p&&(!after||after.p<e.p);return button(f+'층'+(risk?' !':''),'jump:'+f,'small ghost '+(risk?'danger':'')+(dest===f?' destination':''));}).join('')+'</nav><div class="hotel-stack" style="--floors:'+s.floorCount+'">'+floors.map(f=>{
 const e=at(f),d=e&&CREATURES[e.type],classes=['floor',!e?'empty':'',dest===f?'arrival':path.includes(f)?'transit':'',selection&&validFloor(f)?'targetable':'',selection?.kind==='place'&&entity(selection.id)?.floor===f?'selected':''].join(' ');
 return '<section class="'+classes+'" data-floor="'+f+'" '+(e?'data-entity="'+e.id+'" data-type="'+e.type+'"':'')+' tabindex="0" role="group" aria-label="'+f+'층 '+esc(d?.name||'빈층')+'"><span class="floor-number">'+f+'<small>층</small></span><div class="floor-main"><div class="floor-title">'+(e?shape(e.type)+esc(d.name):s.escape===f?'⇥ 탈출구':'빈층')+(e?'<button class="info-button" data-action="info:'+e.id+'" aria-label="'+esc(d.name)+' 정보">ⓘ</button>':'')+'</div><div class="floor-summary">'+(e?shortEffect(e.type):s.escape===f?'통과·도착 즉시 영업 종료':selection?'이 층 선택':'경영 중 괴이를 배치할 수 있습니다')+'</div>'+(e?'<div class="floor-stats"><span>공략도 '+e.c+'/12 '+meter(e.c,12)+'</span><span>파훼 토큰 '+e.p+'/'+d.maxP+'</span>'+(e.shield?'<span class="badge">보호 '+e.shield+'</span>':'')+'</div><div class="floor-actions">'+(s.phase==='management'?button('보관','store:'+e.id,'ghost small')+button('이동','place:'+e.id,'ghost small'):activeButton(e))+'</div>':'')+floorThreat(p,e,f)+'</div>'+(s.visitor?.pos===f&&['roll','choose','prepare'].includes(s.phase)?'<span class="visitor-marker" title="현재 손님" aria-label="현재 손님"></span>':'')+'</section>';
 }).join('')+'</div><div class="hotel-foot muted">↑ 위로 이동 · '+s.floorCount+'층 다음은 1층으로 순환'+(s.visitor&&['roll','choose','prepare'].includes(s.phase)?'<br>현재 손님: '+(s.visitor.pos?s.visitor.pos+'층':'입장 전'):'')+'</div></aside>';
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
function diceFaces(type){return '<span class="dice-faces">'+DICE[type].faces.map(value=>'<span class="face '+(type==='anxiety'&&value===3?'effect':'')+'">'+value+(type==='anxiety'&&value===3?'<sup>+1</sup>':'')+'</span>').join('')+'</span>';}
function equipment(){return '<section class="equipment-strip" aria-label="장착한 주사위"><span class="eyebrow">장착 주사위 · 항상 세 개 중 하나 선택</span><div class="equipment-list">'+game.s.equipped.map((type,slot)=>'<div class="equipment-die"><strong>'+(slot+1)+'. '+esc(DICE[type].name)+'</strong>'+diceFaces(type)+'<small>'+esc(DICE[type].effectText)+'</small></div>').join('')+'</div></section>';}
function management(){
 const s=game.s,cost=game.expansionCost(),reason=game.expansionReason();
 return '<div class="notice"><strong>'+esc(SERVICES[s.round].name)+' 준비</strong><span>생존 괴이는 영업 시작 시 복구됩니다. 빈층을 남기면 탈출구를 열 수 있습니다.</span></div>'+equipment()+'<div class="management-tools"><section class="expansion-offer"><div><strong>호텔 구조 바꾸기</strong><p>'+s.floorCount+'층'+(s.floorCount<10?' → '+(s.floorCount+1)+'층 · 공포 재화 '+cost:' · 최대 층 수')+'</p><small>'+esc(reason||'기존 층은 그대로 · 꼭대기에 빈층 하나 추가')+'</small></div>'+button('꼭대기에 빈층 증설','expand','ghost',s.floorCount>=10)+'</section></div><div class="tabs">'+button('블러드 웹','tab:web','tab '+(tab==='web'?'active':''))+button('보관함 · '+s.entities.filter(e=>e.floor==null).length,'tab:inventory','tab '+(tab==='inventory'?'active':''))+'</div><section class="panel management-panel">'+(tab==='web'?web():inventory())+'</section><div class="action-bar"><p class="muted">다음 손님: '+SERVICES[s.round].guests.map(id=>esc(GUESTS[id].name)).join(' → ')+'</p>'+button('배치를 마치고 영업 시작','start','primary',!s.entities.some(e=>e.floor!=null))+'</div>';
}
function resultSummary(p,base=game.s){
 const v=p.state.visitor,summary=p.summary||{},killed=p.state.stats.kills>base.stats.kills,escaped=p.state.stats.escaped>base.stats.escaped;
 const fear=summary.fear??p.events.filter(e=>e.kind==='fear').reduce((sum,e)=>sum+(e.amount||0),0),hearts=summary.hearts??Math.max(0,(base.visitor?.h||0)-(v?.h||0));
 const dest=p.path.at(-1)??v?.pos;
 const position=escaped?(dest||'입장 전')+'층에서 탈출 · 이번 영업 종료':p.path.length?dest+'층 '+(killed?'처치':'도착'):'이동 없음';
 const attacks=p.attacks||p.events.filter(e=>e.kind==='attack');
 const canceled=killed?'처치, 반격 없음':escaped?'후속 이동·공격 없음':attacks.length?'반격 '+attacks.length+'회':'반격 피해 없음';
 const losses=base.entities.filter(e=>e.floor!=null).map(e=>{const n=p.state.entities.find(x=>x.id===e.id);return !n?e.floor+'층 '+CREATURES[e.type].name+' 파괴':n.p<e.p?e.floor+'층 '+CREATURES[e.type].name+' 토큰 '+(e.p-n.p)+'개 소모':'';}).filter(Boolean);
 const charges=base.entities.filter(e=>e.type==='G').map(e=>{const n=p.state.entities.find(x=>x.id===e.id);return n&&n.uses!==e.uses?e.floor+'층 방어 '+e.uses+'→'+n.uses+'회':'';}).filter(Boolean);
 return '<strong class="preview-summary '+(p.state.phase==='lost'?'danger-text':'success-text')+'">'+esc([position,'공포 +'+fear,'심장 '+hearts+'개 제거',canceled].join(' · '))+'</strong>'+(p.state.phase==='lost'?'<p class="danger-text">이 선택은 패배로 이어집니다.</p>':'')+(losses.length?'<p class="danger-text">'+esc(losses.join(' · '))+'</p>':'')+(charges.length?'<p>'+esc(charges.join(' · '))+'</p>':'');
}
function previewPanel(){
 const s=game.s,p=currentPreview();
 if(!p)return '<div class="route-preview muted">주사위에 마우스를 올리거나 눌러 이동 경로와 결과를 살펴보세요.</div>';
 const v=p.state.visitor,slot=s.phase==='choose'?hoverDie:s.chosenSlot,die=s.dice[slot];
 const applied=s.phase==='prepare'&&die?.bonus?'<p class="completed-effect">✓ 선택 효과 적용 완료: 불안 주사위의 실제 불안 +'+(s.choiceEffect?.amount||0)+' (상한 9) · 아래는 지금부터 남은 이동 예고입니다.</p>':'';
 const route=p.path.map((f,i)=>'<span class="route-step '+(i===p.path.length-1?'destination':'')+'">'+f+'층 '+(i===p.path.length-1&&p.path.length===p.plannedPath?.length?'도착':i===p.path.length-1&&p.summary?.escaped?'탈출':'통과')+'</span>').join('<span class="muted">→</span>');
 const uncertainty=(p.uncertainty||[]).map(u=>'<li>'+esc(u.text||((u.floor||'?')+'층 '+(u.name||CREATURES[u.type]?.name||'괴이')+' · '+(u.destroyed?'파괴 가능':'파훼 토큰 1개 소모 가능')+(u.defeat?' · 전멸 패배 가능':'')))+'</li>').join('');
 return '<div class="route-preview" aria-live="polite"><p class="preview-name">'+esc(DICE[die.type].name)+' · '+die.value+'칸'+(die.bonus?' · 선택 시 불안 +1':' · 추가 효과 없음')+'</p>'+applied+resultSummary(p)+'<div class="route-line">'+route+'</div>'+(p.path.length?button('종료층 '+p.path.at(-1)+'층 보기','jump:'+p.path.at(-1),'ghost small'):'')+'<details class="preview-detail" '+(previewOpen?'open':'')+'><summary>계산 과정과 개별 공격 펼치기</summary><ol class="forecast-events">'+p.events.map(ev=>'<li>'+esc(ev.text)+'</li>').join('')+'</ol><p>최종 손님 상태: 공포 '+v.f+'/'+v.t+' · 불안 '+v.a+'/9 · 심장 '+v.h+'</p></details>'+(uncertainty?'<div class="penalty-list danger-text"><strong>별도 무작위 위험</strong><p>정상 공격 후 생존 괴이 하나에 무작위 공략도 12. 아래는 가능한 결과이며 실제 표적은 아직 정해지지 않았습니다.</p><ul>'+uncertainty+'</ul></div>':'')+'</div>';
}
function battle(){
 const s=game.s,v=s.visitor,selected=s.phase==='prepare'?s.chosenSlot:hoverDie,die=selected!=null?s.dice[selected]:null;
 return '<div class="battle-head"><span class="eyebrow">전투 '+(s.round+1)+'/8 · 손님 '+(s.guestIndex+1)+'/'+SERVICES[s.round].guests.length+' · '+v.turn+'턴</span><span class="badge">'+phaseLabel()+'</span></div><section class="visitor-card"><div class="section-heading"><div><span class="eyebrow">'+(s.round===3?'MID BOSS':s.round===7?'FINAL BOSS':'THE VISITOR')+'</span><h2>'+esc(v.name)+'</h2></div><span class="heart" aria-label="남은 심장 '+v.h+'">'+('♥'.repeat(Math.max(0,v.h)))+'</span></div><div class="stat-grid"><div class="stat-item"><span>공포 · '+term('심장마비')+'</span><strong>'+v.f+' / '+v.t+'</strong>'+meter(v.f,v.t)+'</div><div class="stat-item"><span>'+term('불안')+'</span><strong>'+v.a+' / 9</strong></div><div class="stat-item"><span>처치 보상</span><strong>공포 재화 '+v.reward+'</strong></div></div><p class="muted">공격 패턴 · '+esc(v.attackText||GUESTS[SERVICES[s.round].guests[s.guestIndex]].attackText)+'</p></section>'+equipment()+'<section class="panel dice-panel"><div class="panel-header"><div><span class="eyebrow">CHOOSE YOUR PATH</span><h2>'+({roll:'어디로 안내할까요?',choose:'주사위 하나를 선택하세요',prepare:'이동 전 준비를 마치세요',guest_end:'손님을 처치했습니다',service_end:'이번 영업이 끝났습니다'}[s.phase]||'')+'</h2></div></div><div class="panel-body">'+(s.phase==='roll'?'<p class="muted">세 개의 주사위를 굴린 뒤 하나를 골라 이동합니다.</p>':s.dice?.length?'<div class="dice-row">'+s.dice.map((d,i)=>'<button class="die '+(selected===i?'selected':'')+'" data-action="die:'+i+'" data-die="'+i+'" '+(s.phase!=='choose'?'disabled':'')+' aria-pressed="'+(selected===i)+'" aria-label="'+esc(DICE[d.type].name)+' '+d.value+'칸 '+(d.bonus?'선택 시 불안 1 증가':'추가 효과 없음')+'"><span class="die-name">'+(i+1)+'. '+esc(DICE[d.type].name)+'</span><span class="die-value">'+d.value+'</span><small>'+d.value+'칸 이동</small><span class="die-effect">'+(d.bonus?'선택 시 불안 +1':'추가 효과 없음')+'</span></button>').join('')+'</div>':'')+(['choose','prepare'].includes(s.phase)?previewPanel():'')+'<div class="action-bar">'+(s.phase==='roll'?button('주사위 굴리기','roll','primary'):s.phase==='choose'?button((die?DICE[die.type].name+' · '+die.value+'칸으로 확정':'먼저 주사위를 선택하세요'),'choose','primary',hoverDie==null):s.phase==='prepare'?button('탈출구 열어주기','escape','ghost',s.escape!=null||s.entities.filter(e=>e.floor!=null&&e.p>0).length===s.floorCount)+button('이동 실행','move','primary',!!selection):s.phase==='guest_end'?button('다음 손님 맞이하기','advance','primary'):s.phase==='service_end'?button('정산 확인 · 다음 전투 준비','advance','primary'):'')+'</div></div></section>'+(['roll','choose','prepare'].includes(s.phase)?'<div class="notice '+(s.inactive?'warning':'')+'"><strong>활동 없이 '+s.inactive+'턴</strong><span>'+(s.inactiveLimit-s.inactive)+'턴 더 이어지면 무작위 괴이에 공략도 12 · 충전과 출구 설치는 활동에서 제외</span></div>':'')+logPanel();
}
function reward(){
 return '<section class="panel reward-panel"><div class="panel-header"><div><span class="eyebrow">MID BOSS REWARD</span><h2>후반의 경로를 바꿀 주사위</h2><p>거울 감찰관 처치 · 공포 재화 6과 웹 리셋권 1개 지급 완료</p></div></div><div class="panel-body"><p>세 후보 중 하나를 받으면 기존 주사위 한 개를 교체합니다. 건너뛰어도 다음 영업으로 진행합니다.</p><div class="reward-grid">'+['long','even','anxiety'].map(type=>'<article class="card reward-card '+(rewardType===type?'selected':'')+'"><h3>'+esc(DICE[type].name)+'</h3>'+diceFaces(type)+'<p>'+esc(DICE[type].effectText)+'</p>'+button(rewardType===type?'선택 중':'이 후보 살펴보기','rewardtype:'+type,rewardType===type?'primary':'ghost')+'</article>').join('')+'</div><h3>교체할 현재 주사위</h3><p class="muted">처음 세 개는 모두 같으므로 어느 자리를 교체해도 성능은 같습니다.</p><div class="reward-grid reward-replace">'+game.s.equipped.map((type,i)=>'<article class="card '+(rewardSlot===i?'selected':'')+'"><h3>'+(i+1)+'번째 · '+esc(DICE[type].name)+'</h3>'+diceFaces(type)+'<p>'+esc(DICE[type].effectText)+'</p>'+button(rewardSlot===i?'교체 대상 선택 중':'이 자리를 교체','rewardslot:'+i,rewardSlot===i?'primary':'ghost',rewardType==null)+'</article>').join('')+'</div><div class="notice"><span>'+(rewardType&&rewardSlot!=null?(rewardSlot+1)+'번째 '+DICE[game.s.equipped[rewardSlot]].name+' → '+DICE[rewardType].name+' · 총 세 개 유지':'후보와 교체할 자리를 고른 뒤 확정하세요. 아직 장비는 바뀌지 않았습니다.')+'</span></div><div class="action-bar">'+button('보상 건너뛰기','rewardskip','ghost')+button('선택 초기화','rewardcancel','ghost',rewardType==null&&rewardSlot==null)+button('이 주사위로 교체','rewardconfirm','primary',!rewardType||rewardSlot==null)+'</div></div></section>'+logPanel();
}
function logPanel(){return '<section class="panel log-panel"><div class="panel-header"><h3>호텔의 기록</h3><span class="muted">최근 '+Math.min(12,game.s.logs.length)+'개</span>'+button('전체 기록','record','ghost small')+'</div><ol class="log-list">'+game.s.logs.slice(-12).reverse().map(t=>'<li class="log-entry">'+esc(typeof t==='string'?t:t.text)+'</li>').join('')+'</ol></section>';}
function seedSelector(){return '<label class="seed-selector">시작 난수 번호 <select data-setting="seed">'+[21001,21002,21003].map(n=>'<option value="'+n+'" '+(n===selectedSeed?'selected':'')+'>'+n+(n===21001?' · 첫 실험':' · 추가 실험')+'</option>').join('')+'</select></label>';}
function result(){
 const s=game.s,stats=s.stats;
 return '<section class="result-screen"><span class="eyebrow">END OF THE NIGHT</span><div class="result-emblem">'+(s.phase==='won'?'✧':'◇')+'</div><h1>'+(s.phase==='won'?'마지막 손님이 사라졌다':'호텔의 밤이 끝났다')+'</h1><p>'+esc(s.reason||'모든 영업을 마쳤습니다.')+'</p><div class="result-stats">'+[['도달 전투',(s.round+1)+' / 8'],['처치한 손님',stats.kills+' / 20'],['탈출한 손님',stats.escaped],['미등장 손님',stats.skipped],['획득 공포 재화',stats.earned],['사용한 재화',stats.spent],['파괴된 괴이',stats.destroyed],['최종 호텔',s.floorCount+'층']].map(([k,v])=>'<div><span>'+k+'</span><strong>'+v+'</strong></div>').join('')+'</div>'+equipment()+seedSelector()+'<div class="title-actions">'+button('새 판 시작','new','primary')+button('타이틀로','backtitle','ghost')+button('기록 내려받기','export','ghost')+'</div><p class="muted">이 판의 난수 번호 '+esc(s.seed)+' · 새 판은 6층과 일반 주사위 세 개로 시작합니다. 옵션과 설명 확인 이력은 유지됩니다.</p></section>'+logPanel();
}
function title(){
 return '<main class="title-screen"><div class="title-copy"><span class="eyebrow">DREAD TO DEAD · USER 2</span><h1>어서 오세요.<br>출구는<br><em>위층에 있습니다.</em></h1><p>호텔을 늘리고, 주사위를 고르고,<br>두려움이 이어질 경로를 설계하세요.</p>'+seedSelector()+'<div class="title-actions">'+button('호텔 영업 시작','new','primary')+(game?button('진행 중인 판으로','resume','ghost'):'')+button('플레이 안내','help','ghost')+'</div><div class="title-facts"><span>6~10층 호텔</span><span>8번의 전투</span><span>마지막 보스를 처치하세요</span></div></div><div class="title-art" aria-hidden="true"><div class="hotel-sign">HOTEL<br><small>ROOM TO GROW</small></div>'+[6,5,4,3,2,1].map((f,i)=>'<div class="mini-floor"><span>'+String(f).padStart(2,'0')+'</span><i class="shape" data-type="'+['G','Q','E','Q','B','U'][i]+'"></i><span class="mini-window"></span><span class="mini-window"></span></div>').join('')+'<div class="art-caption">THE WAY UP IS THE WAY BACK.</div></div><button class="button ghost title-options" data-action="options">옵션</button></main>';
}
let onTitle=true;
function render(){
 hideTip();pinned=null;rendering=true;const active=document.activeElement?.dataset?.action;
 const scene=onTitle?'title':game.s.round+':'+game.s.guestIndex+':'+(['management','reward','won','lost'].includes(game.s.phase)?game.s.phase:'battle');
 const preserve=scene===renderedScene;
 const positions=['.hotel-stack','.workspace','.web-scroll'].map(selector=>({selector,top:preserve?$(selector)?.scrollTop||0:0,left:preserve?$(selector)?.scrollLeft||0:0}));
 $('#app').innerHTML=onTitle?title():header()+'<main class="game-layout">'+hotel()+'<div class="workspace">'+(selection?'<div class="selection-banner"><span>'+esc(selection.kind==='place'?'배치할 층을 선택하세요':selection.kind==='escape'?'탈출구를 설치할 빈층을 선택하세요':selection.kind==='G'?'보호할 괴이가 있는 층을 선택하세요':'공략도를 낮출 괴이가 있는 층을 선택하세요')+'</span>'+button('선택 취소','cancel','small ghost')+'</div>':'')+(game.s.phase==='management'?management():game.s.phase==='reward'?reward():['won','lost'].includes(game.s.phase)?result():battle())+'</div></main>';
 for(const pos of positions){const el=$(pos.selector);if(el){el.scrollTop=pos.top;el.scrollLeft=pos.left;}}
 if(active)$$('[data-action]').find(e=>e.dataset.action===active)?.focus({preventScroll:true});
 document.body.classList.toggle('resolving',busy);drawWeb();renderModal();rendering=false;renderedScene=scene;
}
function expansionContent(){
 const p=game.expansionPreview(expansion),s=game.s;
 const faces=s.equipped.flatMap((type,slot)=>DICE[type].faces.map((value,face)=>({type,slot,face,value})));
 const comparison=side=>'<section class="compare-route"><h3>'+side.floorCount+'층 호텔</h3><p>순환 연결: '+side.floorCount+'층 → 1층</p><div class="route-line">'+side.path.map((f,i)=>'<span class="route-step '+(i===side.path.length-1?'destination':'')+'">'+f+'층 '+(i===side.path.length-1?'도착':'통과')+'</span>').join(' → ')+'</div><p><strong>마지막 '+side.path.at(-1)+'층</strong> · '+esc(CREATURES[side.state.entities.find(e=>e.floor===side.arrival)?.type]?.name||'빈층')+'</p><p>'+esc(side.arrivalEffect||'효과 없음')+'</p><p>공포 부여 +'+side.summary.fear+' · 불안 '+expansion.anxiety+' → '+side.state.visitor.a+'</p><details><summary>선택 효과와 이동 과정</summary><ol>'+side.events.map(e=>'<li>'+esc(e.text)+'</li>').join('')+'</ol></details></section>';
 return '<div class="notice"><strong>'+s.floorCount+'층 → '+(s.floorCount+1)+'층</strong><span>공포 재화 '+p.cost+' 사용 · 잔액 '+p.moneyBefore+' → '+p.moneyAfter+' · '+(s.floorCount+1)+'층 빈층 추가</span></div>'+(prefs.tutorial&&!seen.expansionCompare?'<p class="tutorial-inline">같은 위치와 같은 주사위로도 도착층이 달라집니다. 비용·남을 재화·새 순환 경로를 함께 확인하세요.</p>':'')+'<p class="muted">설계 미리보기입니다. 다음 실제 눈을 예측하지 않습니다. 아래 기준으로 선택 효과와 이동만 계산하며 손님의 공포 한계·심장마비·공격은 적용하지 않습니다.</p><div class="expand-controls"><label>가상 시작 위치<select data-expand="position">'+Array.from({length:s.floorCount+1},(_,i)=>'<option value="'+i+'" '+(i===expansion.position?'selected':'')+'>'+(i?i+'층':'입장 전')+'</option>').join('')+'</select></label><label>비교할 주사위와 눈<select data-expand="die">'+faces.map(d=>'<option value="'+d.slot+','+d.face+'" '+(d.slot===expansion.slot&&d.face===expansion.face?'selected':'')+'>'+(d.slot+1)+'번째 '+DICE[d.type].name+' · '+(d.face+1)+'면 · '+d.value+'칸'+(d.type==='anxiety'&&d.value===3?' · 불안 +1':'')+'</option>').join('')+'</select></label><label>기준 불안<input type="number" min="0" max="9" data-expand="anxiety" value="'+expansion.anxiety+'"></label><label>기준 공포<input type="number" min="0" max="99" data-expand="fear" value="'+expansion.fear+'"></label></div><div class="compare-grid">'+comparison(p.before)+comparison(p.after)+'</div><p class="muted">기존 괴이의 위치·공략도·파훼 토큰·사용 횟수는 유지됩니다. 추가 층은 이번 판 동안 유지되며 비용은 환급되지 않습니다.</p>'+(game.expansionReason()?'<p class="danger-text">'+esc(game.expansionReason())+'</p>':'');
}

function drawWeb(){const svg=$('.web-connections');if(!svg)return;const board=$('.web-board');requestAnimationFrame(()=>{if(!svg.isConnected)return;const rect=board.getBoundingClientRect();svg.setAttribute('width',board.scrollWidth);svg.setAttribute('height',board.scrollHeight);svg.innerHTML=game.s.web.nodes.filter(n=>n.parent!=null).map(n=>{const p=board.querySelector('[data-node="'+n.parent+'"]'),c=board.querySelector('[data-node="'+n.id+'"]');if(!p||!c)return '';const a=p.getBoundingClientRect(),b=c.getBoundingClientRect(),x=a.right-rect.left,y=a.top+a.height/2-rect.top,xx=b.left-rect.left,yy=b.top+b.height/2-rect.top;return '<path d="M '+x+' '+y+' C '+(x+24)+' '+y+', '+(xx-24)+' '+yy+', '+xx+' '+yy+'" class="'+(game.s.web.nodes.find(q=>q.id===n.parent).bought?'unlocked':'')+'"/>';}).join('');});}
const tutorialTargets={hotel:'.hotel-panel',coins:'.resources',web:'.management-panel',cards:'.creature-card',expansion:'[data-action="expand"]',concise:'.creature-card',dice:'.dice-row',summary:'.route-preview',diceEffect:'.dice-row',diceApplied:'.completed-effect',longRoute:'.route-line',reward:'.reward-panel',active:'.floor-actions',attack:'.visitor-card',escape:'[data-action="escape"]'};
function renderModal(){
 const root=$('#modal-root');$$('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));
 if(!modal){root.innerHTML='';document.body.classList.remove('has-modal');return;}
 const focused=document.activeElement?.dataset?.expand,previousScroll=$('.modal-body')?.scrollTop||0;
 let body='',footer='',title='',wide=false;
 if(modal.type==='tutorial'){[title,body]=tutorial[modal.key];body='<p>'+esc(body)+'</p>';footer=button('앞으로 설명 끄기','tutorialoff','ghost')+button('확인','tutorialnext','primary');const target=$(tutorialTargets[modal.key]||'.hotel-panel');target?.classList.add('tutorial-highlight');}
 if(modal.type==='options'){title='옵션';body='<label class="settings-row"><span>처음 보는 시스템 설명 팝업</span><input type="checkbox" data-setting="tutorial" '+(prefs.tutorial?'checked':'')+'></label><label class="settings-row"><span>연출 속도</span><select data-setting="speed"><option value="normal" '+(prefs.speed==='normal'?'selected':'')+'>보통</option><option value="fast" '+(prefs.speed==='fast'?'selected':'')+'>빠름</option></select></label>'+seedSelector()+'<p class="muted">설명 팝업을 꺼도 카드·용어·경로 예고는 항상 볼 수 있습니다. 난수 번호는 다음 새 판에 적용됩니다.</p>'+button('설명 확인 이력 초기화','resettutorial','ghost');footer=(!onTitle&&!['won','lost'].includes(game?.s.phase)?button('이번 판 포기','surrenderconfirm','danger'):button('새 판 시작','newconfirm','ghost'))+button('돌아가기','closemodal','primary');}
 if(modal.type==='help'){title='호텔 운영 안내';wide=true;body='<p>구매·배치 → 일반 영업 세 번 → 보스 → 다시 일반 영업 세 번 → 최종 보스. 일반 영업은 손님 세 명을 연속으로 상대합니다.</p><div class="help-topics">'+Object.entries(tutorial).map(([key,[title,text]])=>'<details data-topic="'+key+'"><summary>'+esc(title)+'</summary><p>'+esc(text)+'</p></details>').join('')+'</div><h3>공통 용어</h3><div class="help-topics">'+Object.entries(glossary).map(([key,text])=>'<details><summary>'+key+'</summary><p>'+esc(text)+'</p></details>').join('')+'</div><h3>괴이 사전</h3><div class="card-grid">'+Object.keys(CREATURES).map(t=>creatureCard(t)).join('')+'</div>';footer=button('닫기','closemodal','primary');}
 if(modal.type==='roadmap'){title='앞으로 찾아올 손님';wide=true;body=SERVICES.map((r,i)=>'<section class="roadmap-service"><h3>'+(i+1)+'/8 · '+esc(r.name)+'</h3>'+r.guests.map(id=>{const g=GUESTS[id];return '<p><strong>'+esc(g.name)+'</strong> · 공포 한계 '+g.t+' · 남은 심장 '+g.h+' · 보상 '+g.reward+'<br><span class="muted">'+esc(g.attackText)+'</span></p>';}).join('')+'</section>').join('');footer=button('닫기','closemodal','primary');}
 if(modal.type==='confirm'){title=modal.title;body='<p>'+esc(modal.text)+'</p>';footer=button('취소','closemodal','ghost')+button('확정',modal.action,'danger');}
 if(modal.type==='term'){title=modal.key;body='<p>'+esc(glossary[modal.key])+'</p>';footer=button('돌아가기','closeterm','primary');}
 if(modal.type==='expansion'){title='증설 전후 경로 비교';wide=true;body=expansionContent();footer=button('취소','closemodal','ghost')+button('증설 확정 · 공포 재화 '+game.expansionCost(),'expandconfirm','primary',!!game.expansionReason());}
 if(modal.type==='record'){title='이번 판의 전체 기록';wide=true;body='<p>난수 번호 '+game.s.seed+' · 현재 '+game.s.floorCount+'층 · '+game.s.equipped.map(type=>DICE[type].name).join(' / ')+'</p><ol class="full-record">'+game.s.logs.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ol>';footer=button('기록 내려받기','export','ghost')+button('닫기','closemodal','primary');}
 root.innerHTML='<div class="modal-backdrop '+(modal.type==='tutorial'?'guide-backdrop':'')+'"><section role="dialog" aria-modal="true" aria-label="'+esc(title)+'" class="modal '+(wide?'wide':'')+'"><div class="modal-header"><span class="eyebrow">'+(modal.type==='tutorial'?'HOTEL GUIDE':'DREAD TO DEAD · USER 2')+'</span><h2>'+esc(title)+'</h2></div><div class="modal-body">'+body+'</div><div class="modal-footer">'+footer+'</div></section></div>';
 document.body.classList.add('has-modal');if(focused&&modal.type==='expansion'){const input=root.querySelector('[data-expand="'+focused+'"]');input?.focus({preventScroll:true});if($('.modal-body'))$('.modal-body').scrollTop=previousScroll;}else requestAnimationFrame(()=>root.querySelector('button.primary,button')?.focus({preventScroll:true}));
}

function hideTip(){clearTimeout(tipTimer);clearTimeout(tipClose);$('#tooltip').hidden=true;}
function showTip(id,pin=false){
 const e=entity(id);if(!e)return;pinned=pin?id:null;const box=$('[data-floor="'+e.floor+'"]'),tip=$('#tooltip');if(!box)return;
 let forecast='';
 if(selection&&['G','R'].includes(selection.kind)&&validFloor(e.floor)){
  const c=game.clone();c.active(selection.id,e.id);const prepared=c.s.entities.find(n=>n.id===e.id);const after=c.preview();const final=after.state.entities.find(n=>n.id===e.id);
  forecast='<div class="target-forecast"><strong>이 층을 선택하면 · 가상 결과, 아직 미지불</strong><p>'+(selection.kind==='G'?'이번 턴 보호 '+(e.shield||0)+' → '+prepared.shield:'공략도 '+e.c+' → '+prepared.c+' · 불안 '+game.s.visitor.a+' → '+c.s.visitor.a)+'</p><p>이동·공격 후: '+(final?'공략도 '+final.c+'/12 · 파훼 토큰 '+final.p:'괴이 파괴')+'</p>'+resultSummary(after,c.s)+(after.uncertainty?.length?'<small>무작위 비활동 패널티 이전 예상입니다.</small>':'')+'</div>';
 }else if(e.type==='B'&&!game.activeReason(e.id)){
  const c=game.clone();c.active(e.id);forecast='<div class="target-forecast"><strong>공포 3 주기를 누르면</strong><p>'+(c.s.stats.kills>game.s.stats.kills?'즉시 처치 · 공포 재화 '+game.s.visitor.reward+' · 손님 공격 취소':'공포 '+game.s.visitor.f+' → '+c.s.visitor.f+' · 남은 심장 '+game.s.visitor.h+' → '+c.s.visitor.h)+'</p><small>남은 사용 '+e.uses+' → '+(e.uses-1)+'회</small></div>';
 }
 const routePreview=currentPreview();if(routePreview){const events=routePreview.events.filter(ev=>ev.floor===e.floor&&['anxiety','fear','harvest','charge','move'].includes(ev.kind));if(events.length)forecast+='<div class="card-current"><strong>선택 경로에서 계산</strong><ol>'+events.map(ev=>'<li>'+esc(ev.text)+'</li>').join('')+'</ol></div>';}
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
 if(s.phase!=='prepare')selection=null;
 render();
 if(s.stats.destroyed>(before?.destroyed||0))teach('destroyed');
 if(s.stats.kills>(before?.kills||0)&&s.phase==='guest_end')teach('boundary');
 if(s.resets>(before?.resets??s.resets))teach('reset');
 if(s.inactive>0)teach('idle');
 if(s.phase==='management'&&s.round===3)teach('boss');
 if(s.phase==='management'&&s.round===7)teach('final');
 if(s.phase==='reward')teach('reward');
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
function newGame(){game=new Game(selectedSeed);onTitle=false;selection=null;hoverDie=null;rewardType=null;rewardSlot=null;previewOpen=false;renderedScene=null;expansion={position:0,slot:0,face:0,anxiety:0,fear:0};tab='web';modal=null;queue=[];busy=false;render();teach('hotel','coins','web','expansion','concise');}
function refreshChoice(slot){
 if(!game||game.s.phase!=='choose'||!game.s.dice[slot]||slot===hoverDie)return;
 hoverDie=slot;hideTip();pinned=null;
 const panel=$('.route-preview');if(panel)panel.outerHTML=previewPanel();
 const stack=$('.hotel-stack'),top=stack?.scrollTop||0,hotelEl=$('.hotel-panel');if(hotelEl){hotelEl.outerHTML=hotel();if($('.hotel-stack'))$('.hotel-stack').scrollTop=top;}
 const die=game.s.dice[slot],confirm=$('[data-action="choose"]');if(confirm){confirm.disabled=false;confirm.textContent=DICE[die.type].name+' · '+die.value+'칸으로 확정';}
 $$('[data-die]').forEach(el=>{el.classList.toggle('selected',Number(el.dataset.die)===slot);el.setAttribute('aria-pressed',String(Number(el.dataset.die)===slot));});
 teach('summary');if(die.value>game.s.floorCount)teach('longRoute');
}
function exportRecord(){
 const data={version:'user-2',config:'mvp-config-user-2.md v1.1',seed:game.s.seed,state:game.s};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='dread-user2-'+game.s.seed+'-record.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function action(name){
 const [a,...rest]=name.split(':'),id=rest.join(':');
 if(busy&&!['options','closemodal','term','closeterm'].includes(a))return;
 const before=game?{...game.s.stats,resets:game.s.resets}:null;
 try{
 if(a==='new'){newGame();return;}
 if(a==='newconfirm'){modal={type:'confirm',title:'새 판을 시작할까요?',text:'현재 진행과 자산은 사라집니다. 옵션과 설명 확인 이력은 유지됩니다.',action:'new'};renderModal();return;}
 if(a==='resume'){onTitle=false;render();return;}
 if(a==='backtitle'){onTitle=true;render();return;}
 if(a==='title'){modal={type:'confirm',title:'타이틀로 돌아갈까요?',text:'이 화면을 닫지 않으면 진행 중인 판으로 다시 돌아올 수 있습니다.',action:'gotitle'};renderModal();return;}
 if(a==='gotitle'){modal=null;onTitle=true;render();return;}
 if(['options','help','roadmap','record'].includes(a)){modal={type:a};hideTip();renderModal();return;}
 if(a==='export'){exportRecord();return;}
 if(a==='term'){if(!glossary[id])return;modal={type:'term',key:id,previous:modal};renderModal();return;}
 if(a==='closeterm'){modal=modal?.previous||null;renderModal();return;}
 if(a==='closemodal'){if(modal?.type==='expansion'){seen.expansionCompare=true;save();}modal=null;renderModal();showNextTutorial();return;}
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
 if(a==='confirmplace'){game.place(selection.id,Number(id));selection=null;modal=null;render();return;}
 if(a==='cancel'){selection=null;render();return;}
 if(a==='info'){showTip(id,true);teach(['G','E','R'].includes(entity(id).type)?entity(id).type:'cards');return;}
 if(a==='closetip'){pinned=null;hideTip();return;}
 if(a==='jump'){hideTip();pinned=null;const floor=$('[data-floor="'+Number(id)+'"]');floor?.scrollIntoView({block:'nearest',behavior:'smooth'});floor?.focus({preventScroll:true});return;}
 if(a==='expand'){expansion={position:0,slot:0,face:0,anxiety:0,fear:0};modal={type:'expansion'};hideTip();renderModal();return;}
 if(a==='expandconfirm'){game.expand();seen.expansionCompare=true;save();modal=null;render();toast(game.s.floorCount+'층 빈층이 생겼습니다. 무료로 배치를 조정하세요.');return;}
 if(a==='rewardtype'){rewardType=id;render();return;}
 if(a==='rewardslot'){rewardSlot=Number(id);render();return;}
 if(a==='rewardcancel'){rewardType=null;rewardSlot=null;render();return;}
 if(a==='rewardconfirm'){game.claimDie(rewardType,rewardSlot);rewardType=null;rewardSlot=null;finishAction(before);return;}
 if(a==='rewardskip'){game.skipReward();rewardType=null;rewardSlot=null;finishAction(before);return;}
 if(a==='start'){selection=null;game.startService();hoverDie=null;render();teach('fear','attack');return;}
 if(a==='roll'){game.roll();hoverDie=null;render();teach('dice');if(game.s.dice.some(d=>d.bonus))teach('diceEffect');return;}
 if(a==='die'){if(game.s.phase==='choose'){refreshChoice(Number(id));render();}return;}
 if(a==='choose'){game.choose(hoverDie);hoverDie=null;render();teach('route','anxiety');if(game.s.choiceEffect?.amount)teach('diceApplied');if(game.path(game.s.chosen).some((f,i,ar)=>i&&f<ar[i-1]))teach('loop');if(game.s.entities.some(e=>!game.activeReason(e.id)))teach('active');return;}
 if(a==='active'){const e=entity(id);if(e.type==='B'){game.active(e.id);finishAction(before);}else{selection={kind:e.type,id:e.id};render();teach('target',e.type);}return;}
 if(a==='escape'){selection={kind:'escape'};render();teach('escape');return;}
 if(a==='move'){await moveAnimated();return;}
 if(a==='advance'){game.advance();selection=null;hoverDie=null;finishAction(before);if(game.s.phase==='management')teach('reset');return;}
 }catch(err){busy=false;document.body.classList.remove('resolving');toast(err.message);console.error(err);}
}

document.addEventListener('click',ev=>{
 const el=ev.target.closest('[data-action]');if(el){ev.preventDefault();if(modal&&!el.closest('#modal-root'))return;if(!el.disabled)action(el.dataset.action);return;}
 if(ev.target.closest('details,summary,input,select,label,a'))return;
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
document.addEventListener('pointerover',ev=>{
 if(modal||busy||onTitle)return;
 const die=ev.target.closest('[data-die]');if(die&&game.s.phase==='choose'){refreshChoice(Number(die.dataset.die));return;}
 const floor=ev.target.closest('[data-entity]');if(floor&&!floor.contains(ev.relatedTarget)&&!pinned){clearTimeout(tipClose);clearTimeout(tipTimer);tipTimer=setTimeout(()=>showTip(floor.dataset.entity),150);}
 if(ev.target.closest('#tooltip'))clearTimeout(tipClose);
});
document.addEventListener('pointerout',ev=>{if(!pinned&&(ev.target.closest('[data-entity]')||ev.target.closest('#tooltip'))){clearTimeout(tipTimer);tipClose=setTimeout(hideTip,180);}});
document.addEventListener('focusin',ev=>{if(rendering||modal||busy)return;const die=ev.target.closest('[data-die]');if(die&&game?.s.phase==='choose')refreshChoice(Number(die.dataset.die));const floor=ev.target.closest('[data-entity]');if(floor&&ev.target===floor)showTip(floor.dataset.entity);});
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'){ev.preventDefault();if(modal?.type==='tutorial')action('tutorialnext');else if(modal?.type==='term')action('closeterm');else if(modal)action('closemodal');else if(selection){selection=null;render();}else if(!$('#tooltip').hidden){pinned=null;hideTip();}else if(game?.s.phase==='reward')action('rewardcancel');else action('options');}
 if(ev.key==='Enter'&&ev.target.matches('[data-floor]'))ev.target.click();
 if(modal&&ev.key==='Tab'){const els=[...$('#modal-root').querySelectorAll('button,input,select,summary,[tabindex]')].filter(x=>!x.disabled);const first=els[0],last=els.at(-1);if(ev.shiftKey&&document.activeElement===first){last?.focus();ev.preventDefault();}else if(!ev.shiftKey&&document.activeElement===last){first?.focus();ev.preventDefault();}}
});
document.addEventListener('contextmenu',ev=>{if(selection){ev.preventDefault();selection=null;render();}});
document.addEventListener('change',ev=>{
 const setting=ev.target.dataset.setting;
 if(setting==='tutorial'){prefs.tutorial=ev.target.checked;if(!prefs.tutorial)queue=[];save();}
 if(setting==='speed'){prefs.speed=ev.target.value;save();}
 if(setting==='seed')selectedSeed=Number(ev.target.value);
 const field=ev.target.dataset.expand;
 if(field&&modal?.type==='expansion'){
  if(field==='die'){const [slot,face]=ev.target.value.split(',').map(Number);expansion.slot=slot;expansion.face=face;}
  else {const max=field==='anxiety'?9:field==='position'?game.s.floorCount:99;expansion[field]=Math.max(0,Math.min(max,Math.floor(Number(ev.target.value)||0)));}
  renderModal();
 }
});
document.addEventListener('toggle',ev=>{if(ev.target.dataset?.topic&&ev.target.open){seen[ev.target.dataset.topic]=true;save();}if(ev.target.classList?.contains('preview-detail'))previewOpen=ev.target.open;if(ev.target.classList?.contains('card-details'))drawWeb();},true);

addEventListener('resize',()=>{drawWeb();if(pinned)showTip(pinned,true);});
render();
