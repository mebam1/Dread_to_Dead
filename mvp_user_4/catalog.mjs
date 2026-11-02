/** User-4 catalogue. User-supplied values take precedence over earlier experiments. */
export const RULE_VERSION='user-4-v1.2';
export const STATUS_CAP=99;
export const CAPS=Object.freeze({a:STATUS_CAP,greed:STATUS_CAP,prophecy:STATUS_CAP,seal:STATUS_CAP,fire:STATUS_CAP,uses:STATUS_CAP});
export const ANXIETY_CAP=CAPS.a;
export const EXPANSION_COSTS=Object.freeze([4,6,8,10]);
export const STARTERS=Object.freeze([['gaze',1],['owner',3],['runes',5],['safe',6]].map(Object.freeze));
export const DICE=Object.freeze({
  normal:{name:'일반 주사위',faces:[1,2,3,4,5,6],effectText:'추가 효과 없음'},
  long:{name:'장거리 주사위',faces:[1,2,3,4,5,8],effectText:'8칸 이동 가능'},
  even:{name:'짝수 주사위',faces:[2,2,4,4,6,6],effectText:'짝수 눈만 나옴'},
  anxiety:{name:'불안 주사위',faces:[1,1,3,3,5,5],effectText:'이 주사위의 3을 확정하면 불안 +1'}
});
for(const die of Object.values(DICE)){Object.freeze(die.faces);Object.freeze(die);}
const raw={
  gaze:['문틈의 시선','불안',3,12,2,'불안 +3','불안 +1','없음','통과 불안 +3 → +4'],
  footsteps:['따라오는 발소리','불안',3,12,1,`현재 불안 두 배, 전체 상한 ${CAPS.a}`,'없음','없음','현재·최대 파훼 토큰 +1 (최대 1 → 2)'],
  owner:['시선의 주인','불안',4,12,2,'없음','보유 불안 절반(올림) 소비 → 지불한 불안만큼 공포','없음','소비한 불안의 공포 배율 1 → 2'],
  mouse:['별것 아닌 생쥐','불안',4,12,2,'없음','없음','불안 2 소비 → 괴이 하나 공략도 최대 6 감소','공략도 감소량 6 → 10'],
  portrait:['노려보는 초상화','불안',5,8,2,'없음','없음','불안 4 소비 → 확정한 주사위 눈 +1','불안 비용 4 → 3'],
  safe:['유혹하는 금고','탐욕',3,20,2,'유인을 켜면 이동을 멈추고 이 층에 도착','탐욕 +1','유인 켜기 / 끄기. 비용 없음','도착 탐욕 +1 → +2'],
  nepenthes:['모욕하는 네펜데스','탐욕',5,14,2,'없음','없음','탐욕 1 소비 → 자신 방어 +4, 괴이 하나의 이번 턴 피해 대신 받기','자신 방어 +4 → +8'],
  barnacle:['수정 따개비','탐욕',4,14,2,'이동 후 실제 통과한 층의 괴이에 방어 +2. 최종 도착층 제외','없음','탐욕 1 · 속공 1 소비 → 이번 턴 자신의 통과 방어 +2를 +4로 교체','공략 한계 14 → 18'],
  collector:['수집가','탐욕',3,14,2,'없음','없음','탐욕 2 · 속공 1 소비 → 괴이 하나 공략도 최대 16 감소, 봉인 +3','부여 봉인 +3 → +2'],
  runes:['룬 문자 벽','예언',3,12,2,'최종 눈 3 이하: 예언 +1','최종 눈 3 이하: 예언 +2','없음','도착 예언 +2 → +3'],
  roulette:['이름이 새겨진 룰렛','예언',3,12,2,'최종 눈 짝수: 예언 +1','최종 눈 짝수: 예언 +2','없음','도착 예언 +2 → +3'],
  prophet:['횡설수설하는 예언가','예언',4,12,2,'없음','없음','예언 4 소비 → 주사위 3개 다시 굴림. 새 눈의 최솟값만큼 예언 획득','예언 1 소비 → 주사위 3개 다시 굴림. 예언 환급 없음'],
  samara:['사마라의 약속','예언',4,12,2,'없음','없음','예언 2 소비 → 확정한 주사위 눈 −1. 최소 1','공략 한계 12 → 14']
};
const concepts={gaze:'문 뒤에서 누군가 지켜보는 느낌이 듭니다.',footsteps:'복도 탐색 중 누군가의 발소리가 들립니다.',owner:'문 뒤의 그것과 마주칩니다.',mouse:'다행히 생쥐였습니다.',portrait:'괜히 발걸음이 빨라집니다.',safe:'탐욕이 화를 부르는 법입니다.',nepenthes:'시선을 돌리는 존재가 나타납니다.',barnacle:'손님에게 달라붙었다가 괴이의 몸에 달라붙어 갑옷을 제공합니다.',collector:'다른 괴이를 수집하기를 즐기는 자입니다.',runes:'대체 무슨 뜻일까요?',roulette:'룰렛이 방문객의 이름을 가리킵니다.',prophet:'그런 말은 한 적이 없다고 합니다.',samara:'예정된 운명입니다.'};
const shapes=['triangle','hexagon','diamond','cross','square','square','triangle','hexagon','circle','square','circle','diamond','cross'];
const activeLabels={mouse:'공략도 수리',portrait:'눈 +1',safe:'유인 켜기 / 끄기',nepenthes:'대신 맞기',barnacle:'통과 방어 강화',collector:'수리하고 봉인',prophet:'다시 굴리기',samara:'눈 −1'};
export const CREATURES=Object.freeze(Object.fromEntries(Object.entries(raw).map(([type,[name,role,price,limit,maxP,passText,arrivalText,activeText,upgradeText]],index)=>{
 const limitedUses=['barnacle','collector'].includes(type),initialUses=type==='collector'?1:0,hasActive=!!activeLabels[type];
 return [type,Object.freeze({type,name,role,price,limit,maxP,passText,arrivalText,activeText,upgradeText,concept:concepts[type],initialUses,maxUses:initialUses,maxStoredUses:limitedUses?CAPS.uses:0,limitedUses,hasActive,targeted:['mouse','nepenthes','collector'].includes(type),color:role==='불안'?'#c3a77b':role==='탐욕'?'#7aaf9b':'#a893cf',shape:shapes[index],activeLabel:activeLabels[type]||'',passiveText:type==='safe'?`실제 피해를 받고 생존하면 탐욕 +1. 최대 ${CAPS.greed}`:type==='barnacle'?`실제 피해를 받고 생존하면 자신의 속공 +1. 최대 ${CAPS.uses}`:'없음',summary:(passText!=='없음'?'통과: '+passText:arrivalText!=='없음'?'도착: '+arrivalText:activeText)})];
})));
export const UPGRADE_TEXT=Object.freeze(Object.fromEntries(Object.entries(CREATURES).map(([type,d])=>[type,d.upgradeText])));
export function creatureDef(value){
 const e=typeof value==='string'?{type:value}:value;
 if(!e||!CREATURES[e.type])throw new Error('알 수 없는 괴이입니다.');
 const b=CREATURES[e.type],up=!!e.upgraded;
 const d={...b,upgraded:up,name:b.name+(up?'+':''),maxP:e.type==='footsteps'&&up?2:b.maxP,limit:up&&e.type==='samara'?14:up&&e.type==='barnacle'?18:b.limit,
  passAnxiety:up?4:3,arrivalAnxiety:1,harvestMultiplier:up?2:1,repairPower:up?10:6,shieldPower:up?8:4,sealPower:up?2:3,prophetCost:up?1:4,portraitCost:up?3:4,arrivalProphecy:up?3:2};
 if(up){
  if(e.type==='gaze')d.passText='불안 +4';
  if(e.type==='owner')d.arrivalText='보유 불안 절반(올림) 소비 → 지불한 불안의 2배만큼 공포';
  if(e.type==='mouse')d.activeText='불안 2 소비 → 괴이 하나 공략도 최대 10 감소';
  if(e.type==='portrait')d.activeText='불안 3 소비 → 확정한 주사위 눈 +1';
  if(e.type==='safe')d.arrivalText='탐욕 +2';
  if(e.type==='nepenthes')d.activeText='탐욕 1 소비 → 자신 방어 +8, 괴이 하나의 이번 턴 피해 대신 받기';
  if(e.type==='collector')d.activeText='탐욕 2 · 속공 1 소비 → 괴이 하나 공략도 최대 16 감소, 봉인 +2';
  if(['runes','roulette'].includes(e.type))d.arrivalText=d.arrivalText.replace('+2','+3');
  if(e.type==='prophet')d.activeText='예언 1 소비 → 주사위 3개 다시 굴림. 예언 환급 없음';
 }
 if(e.type==='safe')d.passText=e.lure?'유인 켜짐: 통과하려는 손님이 이동을 멈추고 도착':'유인 꺼짐. 속공으로 켜기 가능';
 if(e.type==='barnacle'&&e.barnacleBoost)d.passText='이번 턴: 이동 후 실제 통과한 층의 괴이에 방어 +4. 최종 도착층 제외';
 d.summary=(d.passText!=='없음'?'통과: '+d.passText:d.arrivalText!=='없음'?'도착: '+d.arrivalText:d.activeText);
 return d;
}
export const creatureName=e=>creatureDef(e).name;
/** Identity metadata only. enemies.mjs owns thresholds, hearts, powers and attack text. */
export const GUESTS=Object.freeze({
 N1:{name:'성급한 투숙객',reward:2,pattern:'double'},
 N2:{name:'복도 점검원',reward:2,pattern:'route'},
 N3:{name:'옆방을 확인하는 손님',reward:2,pattern:'adjacent'},
 N4:{name:'두 번 확인하는 손님',reward:2,pattern:'double'},
 N5:{name:'야간 점검원',reward:2,pattern:'route'},
 N6:{name:'거울을 보는 손님',reward:2,pattern:'mirror'},
 BOSS1:{name:'거울 감찰관',reward:6,pattern:'bossMirror'},
 BOSS2:{name:'호텔의 조사관',reward:8,pattern:'final'}
});
