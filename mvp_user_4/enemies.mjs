/** User-4 enemy balance. Attack descriptions and damage share these numbers. */
import {GUESTS} from './catalog.mjs';

const profile=(t,h,power,mirrorPower=power)=>({t,h,power,doublePower:power,mirrorPower});
function freezeTree(value){
  for(const child of Object.values(value))if(child&&typeof child==='object')freezeTree(child);
  return Object.freeze(value);
}

export const ENEMY_TUNING=freezeTree({
  opening:{
    N1:profile(4,1,1),N2:profile(4,1,1),N3:profile(5,1,1),N4:profile(5,1,1)
  },
  normal:{
    1:{N1:profile(6,1,2),N2:profile(6,1,1),N3:profile(7,1,2),N4:profile(6,1,2)},
    2:{N3:profile(8,1,4),N4:profile(8,2,4),N5:profile(10,2,3),N6:profile(10,2,4)},
    3:{N3:profile(10,1,5),N4:profile(10,2,5),N5:profile(12,2,4),N6:profile(12,2,5)}
  },
  elite:{1:profile(8,2,2),2:profile(10,2,4),3:profile(14,3,6)},
  boss:{1:profile(10,2,4),2:profile(14,2,4,5),3:profile(18,3,6,7)}
});

const ELITES=Object.freeze({
  1:{name:'정예 복도 점검원',pattern:'route',reward:6},
  2:{name:'정예 야간 점검원',pattern:'route',reward:6},
  3:{name:'정예 거울 감찰관',pattern:'mirror',reward:6}
});
const FINAL_BOSS=Object.freeze({name:'호텔의 조사관 · 최종 조사',pattern:'final',reward:10});

function attackText({pattern,power,doublePower,mirrorPower}){
  if(pattern==='route')return `실제 경로 각 방문 순서대로 공략도 ${power}`;
  if(pattern==='adjacent')return `도착 바로 아래층 ${power} → 도착층 ${power}`;
  if(pattern==='mirror'||pattern==='bossMirror')return `도착 아래 2층 ${mirrorPower} → 위 2층 ${mirrorPower}`;
  if(pattern==='final')return `홀수 턴: 도착층 ${doublePower}씩 두 번 / 짝수 턴: 아래 2층 ${mirrorPower} → 위 2층 ${mirrorPower}`;
  if(pattern==='double')return `도착층 공략도 ${doublePower}씩 두 번`;
  throw new Error('정의되지 않은 손님 공격 패턴입니다.');
}

/** Metadata comes from the existing roster; no legacy numeric defaults are copied. */
export function createGuest(id,act,depth,kind='normal'){
  if(!Number.isInteger(act)||act<1||act>3||!Number.isInteger(depth)||depth<1||depth>8)throw new Error('유효한 막과 방문 깊이가 필요합니다.');
  let metadata,tuning;
  if(kind==='normal'){
    metadata=GUESTS[id];
    tuning=act===1&&depth===1?ENEMY_TUNING.opening[id]:ENEMY_TUNING.normal[act][id];
  }else if(kind==='elite'&&id===`E${act}`){
    metadata=ELITES[act];tuning=ENEMY_TUNING.elite[act];
  }else if(kind==='boss'&&id===`BOSS${act}`){
    metadata=act===3?FINAL_BOSS:GUESTS[id];tuning=ENEMY_TUNING.boss[act];
  }
  if(!metadata||!tuning)throw new Error('해당 막의 손님 수치가 정의되어 있지 않습니다.');
  const guest={id,name:metadata.name+(kind==='normal'&&act===3?' · 3막 강화':''),pattern:metadata.pattern,reward:metadata.reward,...tuning,attackBonus:0};
  guest.attackText=attackText(guest);
  return guest;
}
