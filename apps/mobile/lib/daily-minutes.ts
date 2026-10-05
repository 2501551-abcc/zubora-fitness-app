/**
 * 筋トレ時間の「日別グラフ」用の集計（純粋関数）。
 * 集計は日本時間(JST)の暦日で行う（DB の user_workout_stats / get_home_stats と同じ基準）。
 * 端末のタイムゾーンには左右されない。
 */

export interface DailyMinutes {
  /** JST の暦日 'YYYY-MM-DD' */
  date: string;
  /** 曜日 1 文字（日〜土） */
  label: string;
  /** その日の筋トレ合計（分。四捨五入） */
  minutes: number;
  /** 今日かどうか */
  isToday: boolean;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 日時を JST の暦日 'YYYY-MM-DD' にする */
export function toJstDay(d: Date | string): string {
  const t = typeof d === 'string' ? new Date(d) : d;
  return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 直近 days 日ぶんを取得する起点（最も古い日の JST 0:00 を ISO 文字列にしたもの） */
export function rangeStartIso(now: Date, days = 7): string {
  const todayMs = Date.parse(`${toJstDay(now)}T00:00:00Z`);
  return new Date(todayMs - (days - 1) * DAY_MS - JST_OFFSET_MS).toISOString();
}

/** 直近 days 日ぶん（古い順・今日が最後）の、JST 暦日ごとの筋トレ分数を作る */
export function buildDailyMinutes(
  rows: { created_at: string; duration_sec: number }[],
  now: Date,
  days = 7,
): DailyMinutes[] {
  const today = toJstDay(now);
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  const secByDay: Record<string, number> = {};
  for (const r of rows) {
    const day = toJstDay(r.created_at);
    secByDay[day] = (secByDay[day] ?? 0) + Math.max(0, r.duration_sec);
  }

  return Array.from({ length: days }, (_, i) => {
    const ms = todayMs - (days - 1 - i) * DAY_MS;
    const date = new Date(ms).toISOString().slice(0, 10);
    return {
      date,
      label: WEEKDAYS[new Date(ms).getUTCDay()],
      minutes: Math.round((secByDay[date] ?? 0) / 60),
      isToday: date === today,
    };
  });
}
