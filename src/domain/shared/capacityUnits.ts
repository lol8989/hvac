// 용량 단위 변환(순수, Shared Kernel). 도메인은 용량을 kW로 다루지만
// 스펙시트·산출물·표시는 W를 쓴다. 흩어진 W↔kW 변환의 단일 소유처.
//
// 세 가지가 서로 다른 연산임에 주의한다(예전엔 이름이 겹쳐 혼동됐다):
//   · wToKw    — 정확 변환(반올림 없음). 계산·부하에 쓴다.
//   · roundKw  — 0.1kW로 반올림. 사람이 읽는 표시에만 쓴다(1206W → 1.2kW).
//   · kwToW    — 정수 W로. 스펙시트·산출물 컬럼에 쓴다.

export const wToKw = (w: number): number => w / 1000
export const roundKw = (w: number): number => Math.round(w / 100) / 10
export const kwToW = (kw: number): number => Math.round(kw * 1000)
