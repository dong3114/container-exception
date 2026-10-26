/**
 * 회신 문장의 날짜 표현 확인(T-093) — 회신 계약(`reply-extract/1`)에는 답의 **날짜 칸이 없다**. 그래서 "모레 4대" 를 모델이 수량 4 로만 돌려주면
 * 질문 날짜의 값처럼 보인다. 표현할 수 없는 날짜를 질문 날짜라고 **임의로 해석해 임시 사실로 올리지 않는다**.
 *
 * 순수 모듈: 근거 인용이 들어 있는 문장에서 날짜 표현을 찾아
 *   - 풀 수 있는 것(오늘 · 내일 · 모레 · 글피 · 어제 · "10월 27일" · "27일" · today · tomorrow)은 회신 근거 날짜를 기준으로 날짜로 바꾸고
 *   - 풀 수 없는 것(요일 · 다음 주 · 이번 주 · 주말 · 월말 …)은 "확인 불가" 로 표시한다.
 * 호출자는 풀린 날짜가 모두 질문 날짜와 같을 때만 통과시킨다. 날짜 표현이 없으면 질문 날짜의 답으로 본다(질문이 날짜를 정해 보냈다).
 * 범용 날짜 해석기가 아니다 — 모르면 사람에게 보낸다.
 */

export interface DateScope {
  /** 풀린 날짜(YYYY-MM-DD, Asia/Seoul) */
  resolved: string[];
  /** 날짜를 말하는 것 같지만 풀 수 없는 표현 */
  unresolved: string[];
}

const RELATIVE: [RegExp, number][] = [
  [/오늘|금일|today/i, 0],
  [/내일|명일|tomorrow/i, 1],
  [/모레/, 2],
  [/글피/, 3],
  [/어제|yesterday/i, -1],
];
const UNRESOLVABLE = /(월|화|수|목|금|토|일)요일|다음\s*주|담주|이번\s*주|금주|주말|월말|월초|다음\s*달|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function ymd(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** `text` 에서 날짜 표현. `replyDate` = 회신 근거 시각의 Asia/Seoul 날짜(상대 표현의 기준), `askDate` = 질문 날짜(연 · 월 보충). */
export function dateMentions(text: string, replyDate: string, askDate: string): DateScope {
  const resolved = new Set<string>();
  const unresolved: string[] = [];
  for (const [re, days] of RELATIVE) if (re.test(text)) resolved.add(addDays(replyDate, days));
  const year = Number(askDate.slice(0, 4));
  const month = Number(askDate.slice(5, 7));
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    const d = ymd(year, Number(m[1]), Number(m[2]));
    if (d) resolved.add(d);
    else unresolved.push(m[0]);
  }
  // "27일"(월 없이) — "N월 N일" 의 일 부분과 "N일간" · "N일 동안"(기간)은 뺀다
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*일(?!\s*(?:간|동안|째|치))/g)) {
    const before = text.slice(0, m.index ?? 0);
    if (/\d\s*월\s*$/.test(before)) continue;
    const d = ymd(year, month, Number(m[1]));
    if (d) resolved.add(d);
    else unresolved.push(m[0]);
  }
  const u = UNRESOLVABLE.exec(text);
  if (u) unresolved.push(u[0]);
  return { resolved: [...resolved].sort(), unresolved };
}

/** 원문에서 인용이 들어 있는 문장(인용 앞뒤의 문장 경계까지). 인용 위치를 모르면 인용 자신. */
export function sentenceAround(source: string, quote: string): string {
  const at = source.indexOf(quote);
  if (at < 0) return quote;
  const boundary = /[.!?。\n]/;
  let start = at;
  while (start > 0 && !boundary.test(source[start - 1] as string)) start -= 1;
  let end = at + quote.length;
  while (end < source.length && !boundary.test(source[end] as string)) end += 1;
  return source.slice(start, end);
}
