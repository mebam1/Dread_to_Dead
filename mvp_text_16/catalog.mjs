/** Fixed text-16-v1.0 experiment values; see mvps/mvp-config-16.md. */
export const RULE_VERSION='text-16-v1.0';
export const CAPS=Object.freeze({a:20,greed:2,prophecy:10,seal:9,fire:9});
export const EXPANSION_COSTS=Object.freeze([4,6,8,10]);
export const STARTERS=Object.freeze([['gaze',1],['owner',3],['runes',5],['safe',6]].map(Object.freeze));
export const DICE=Object.freeze({
  normal:{name:'일반 주사위',faces:[1,2,3,4,5,6],effectText:'추가 효과 없음'},
  long:{name:'장거리 주사위',faces:[1,2,3,4,5,8],effectText:'8칸 이동 가능'},
  even:{name:'짝수 주사위',faces:[2,2,4,4,6,6],effectText:'짝수 눈만 나옴'},
  anxiety:{name:'불안 주사위',faces:[1,1,3,3,5,5],effectText:'확정 시 눈 3이면 불안 +1'}
});
for(const die of Object.values(DICE)){Object.freeze(die.faces);Object.freeze(die);}
const raw={
  gaze:['문틈의 시선','불안',3,12,2,'불안 +2','불안 +4','없음','통과 불안 +2 → +3'],
  footsteps:['따라오는 발소리','불안',3,12,1,'현재 불안 두 배','없음','없음','파훼 토큰 1 → 2'],
  owner:['시선의 주인','불안',4,12,2,'없음','불안 전부 소비 → 같은 양 공포','없음','수확 효과 뒤 불안 +1 (불안 0에서도 공급)'],
  mouse:['별것아닌 생쥐','불안',4,12,2,'없음','없음','불안 2 → 괴이 하나 공략도 −6','수리 6 → 10'],
  safe:['유혹하는 금고','탐욕',3,20,2,'유인을 켜면 손님을 멈추고 도착시킴','탐욕 +1','유인 켜기/끄기','도착 탐욕 +1 → +2'],
  nepenthes:['보석박힌 네펜데스','탐욕',5,20,2,'없음','없음','탐욕 1 → 다른 괴이의 이번 턴 피해 대신 받기','자신 방어 +2를 먼저 부여'],
  barnacle:['보석 따개비','탐욕',4,14,2,'실제 도착 괴이에 방어 +3','탐욕 1 → 자신의 액티브 횟수 +1','횟수 1 → 괴이 하나 방어 +10','액티브 방어 10 → 15'],
  collector:['수집가','탐욕',3,12,1,'없음','탐욕 +1','횟수 1 → 다른 괴이 봉인 +3, 탐욕 +2','봉인 +3 → +2, 횟수 비용 1 유지'],
  runes:['룬 문자 벽','예언',3,12,2,'최종 눈 3 이하: 예언 +1','최종 눈 3 이하: 예언 +4','없음','도착 예언 +4 → +5'],
  roulette:['이름이 새겨진 룰렛','예언',3,12,2,'최종 눈 짝수: 예언 +1','최종 눈 짝수: 예언 +4','없음','도착 예언 +4 → +5'],
  prophet:['횡설수설하는 예언가','예언',4,12,2,'없음','없음','예언 4 → 같은 턴 굴림 단계 복귀','예언 비용 4 → 3'],
  samara:['사마라의 약속','예언',4,12,2,'없음','없음','예언 2 → 확정한 눈 −1','공략 한계 12 → 14']
};
const concepts={gaze:'문 뒤에서 누군가 지켜보는 느낌이 듭니다.',footsteps:'복도 탐색 중 누군가의 발소리가 들립니다.',owner:'문 뒤의 그것과 마주칩니다.',mouse:'다행히 생쥐였습니다.',safe:'탐욕이 화를 부르는 법입니다.',nepenthes:'시선을 돌리는 존재가 나타납니다.',barnacle:'손님에게 달라붙었다가 괴이의 몸에 달라붙어 갑옷을 제공합니다.',collector:'다른 괴이를 수집하기를 즐기는 자입니다.',runes:'대체 무슨 뜻일까요?',roulette:'룰렛이 방문객의 이름을 가리킵니다.',prophet:'그런 말은 한 적이 없다고 합니다.',samara:'예정된 운명입니다.'};
export const CREATURES=Object.freeze(Object.fromEntries(Object.entries(raw).map(([type,[name,role,price,limit,maxP,passText,arrivalText,activeText,upgradeText]])=>[type,Object.freeze({type,name,role,price,limit,maxP,passText,arrivalText,activeText,upgradeText,concept:concepts[type],initialUses:type==='collector'?1:0,maxStoredUses:type==='barnacle'?2:type==='collector'?1:0})])));
export const UPGRADE_TEXT=Object.freeze(Object.fromEntries(Object.entries(CREATURES).map(([type,d])=>[type,d.upgradeText])));
export function creatureDef(value){
  const e=typeof value==='string'?{type:value}:value;
  if(!e||!CREATURES[e.type])throw new Error('알 수 없는 괴이입니다.');
  const b=CREATURES[e.type],up=!!e.upgraded;
  const d={...b,upgraded:up,name:b.name+(up?'+':''),maxP:e.type==='footsteps'&&up?2:b.maxP,limit:e.type==='samara'&&up?14:b.limit,
    passAnxiety:up?3:2,repairPower:up?10:6,shieldPower:up?15:10,sealPower:up?2:3,prophetCost:up?3:4,arrivalProphecy:up?5:4};
  if(up){
    if(e.type==='gaze')d.passText='불안 +3';
    if(e.type==='owner')d.arrivalText+='; 그 뒤 불안 +1 (불안 0에서도 공급)';
    if(e.type==='mouse')d.activeText='불안 2 → 괴이 하나 공략도 −10';
    if(e.type==='safe')d.arrivalText='탐욕 +2';
    if(e.type==='nepenthes')d.activeText='탐욕 1 → 자신 방어 +2; 다른 괴이의 이번 턴 피해 대신 받기';
    if(e.type==='barnacle')d.activeText='횟수 1 → 괴이 하나 방어 +15';
    if(e.type==='collector')d.activeText='횟수 1 → 다른 괴이 봉인 +2; 탐욕 +2';
    if(['runes','roulette'].includes(e.type))d.arrivalText=d.arrivalText.replace('+4','+5');
    if(e.type==='prophet')d.activeText='예언 3 → 같은 턴 굴림 단계 복귀';
  }
  return d;
}
export const creatureName=e=>creatureDef(e).name;
export const GUESTS=Object.freeze({
  N1:{name:'성급한 투숙객',t:12,h:1,reward:2,pattern:'double',attackText:'도착층 6씩 두 번'},
  N2:{name:'복도 점검원',t:12,h:1,reward:2,pattern:'route',attackText:'실제 경로 각 방문 공략도 4'},
  N3:{name:'옆방을 확인하는 손님',t:16,h:1,reward:2,pattern:'adjacent',attackText:'도착 아래층 6 → 도착층 6'},
  N4:{name:'두 번 확인하는 손님',t:12,h:2,reward:2,pattern:'double',attackText:'도착층 6씩 두 번'},
  N5:{name:'야간 점검원',t:16,h:2,reward:2,pattern:'route',attackText:'실제 경로 각 방문 공략도 4'},
  N6:{name:'거울을 보는 손님',t:16,h:2,reward:2,pattern:'mirror',attackText:'도착 아래 2층 6 → 위 2층 6'},
  BOSS1:{name:'거울 감찰관',t:16,h:2,reward:6,pattern:'bossMirror',attackText:'도착 아래 2층 8 → 위 2층 8'},
  BOSS2:{name:'호텔의 조사관',t:20,h:3,reward:8,pattern:'final',attackText:'홀수: 도착층 6 두 번 / 짝수: 아래 2층 8 → 위 2층 8'}
});
