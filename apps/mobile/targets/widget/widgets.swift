import WidgetKit
import SwiftUI

// MARK: - 共有データ

/// メインアプリ（RN 側 lib/widget-bridge.ts の ExtensionStorage）と共有する App Group。
/// app.json の ios.entitlements / expo-target.config.js の entitlements と一致させること。
private let appGroup = "group.com.zubora.workout"

private struct WidgetData {
    var streakDays: Int
    var lastWorkoutAt: Date?
    var reminderHour: Int

    static func load() -> WidgetData {
        let defaults = UserDefaults(suiteName: appGroup)
        let streak = defaults?.integer(forKey: "streakDays") ?? 0
        let reminder = defaults?.object(forKey: "reminderHour") as? Int ?? 19
        var last: Date? = nil
        if let iso = defaults?.string(forKey: "lastWorkoutAt"), !iso.isEmpty {
            last = parseISO(iso)
        }
        return WidgetData(streakDays: streak, lastWorkoutAt: last, reminderHour: reminder)
    }

    /// JS の `new Date().toISOString()`（小数秒あり）と小数秒なしの両方を許容する。
    private static func parseISO(_ text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: text) { return d }
        return ISO8601DateFormatter().date(from: text)
    }
}

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
    let date: Date
    let streakDays: Int
    /// 0.0（まだ先）〜 1.0（リマインド時刻）。背景をティールへ寄せる度合い。
    let tintProgress: Double
    /// 今日すでに筋トレ済みか。
    let doneToday: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), streakDays: 5, tintProgress: 0.3, doneToday: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        completion(makeEntry(for: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let data = WidgetData.load()
        let now = Date()
        let calendar = Calendar.current

        var entries: [StreakEntry] = []
        // いまから 8 時間先まで 30 分刻みでエントリを作り、時間経過で色が変わるようにする。
        for minuteOffset in stride(from: 0, through: 8 * 60, by: 30) {
            let entryDate = calendar.date(byAdding: .minute, value: minuteOffset, to: now)!
            entries.append(makeEntry(for: entryDate, data: data))
        }

        // 次のリマインド時刻に作り直す（そこで色がリセット/前進する）。
        let refresh = calendar.date(byAdding: .hour, value: 4, to: now)!
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }

    private func makeEntry(for date: Date, data: WidgetData) -> StreakEntry {
        let calendar = Calendar.current
        let doneToday = data.lastWorkoutAt.map { calendar.isDateInToday($0) } ?? false

        // 当日のリマインド時刻。
        let reminder = calendar.date(
            bySettingHour: min(max(data.reminderHour, 0), 23), minute: 0, second: 0, of: date
        ) ?? date

        // リマインドの 6 時間前から時刻ちょうどにかけて 0→1。過ぎたら 1 のまま。
        let windowSeconds: Double = 6 * 60 * 60
        let secondsUntil = reminder.timeIntervalSince(date)
        let progress: Double
        if secondsUntil >= windowSeconds {
            progress = 0
        } else if secondsUntil <= 0 {
            progress = 1
        } else {
            progress = 1 - (secondsUntil / windowSeconds)
        }

        return StreakEntry(
            date: date,
            streakDays: data.streakDays,
            tintProgress: doneToday ? 0 : progress,
            doneToday: doneToday
        )
    }
}

// MARK: - View

struct ZuboraStreakWidgetView: View {
    var entry: StreakEntry

    private var accent: Color { Color("$accent") }
    private var base: Color { Color("$widgetBackground") }

    /// base → accent を tintProgress で補間した背景色。
    private var background: Color {
        mix(base, accent, fraction: entry.tintProgress * 0.85)
    }

    private var subtitle: String {
        if entry.doneToday { return "今日はもう完了！えらい" }
        if entry.tintProgress >= 0.85 { return "そろそろ動く時間だよ" }
        return "タップで即スタート"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text(entry.doneToday ? "✅" : "🔥")
                Text(entry.streakDays > 0 ? "\(entry.streakDays)日連続" : "はじめよう")
                    .font(.headline)
                    .fontWeight(.bold)
            }
            .foregroundStyle(entry.tintProgress > 0.5 ? Color.white : Color(hex: 0x04342C))

            Spacer(minLength: 0)

            Text(subtitle)
                .font(.caption)
                .foregroundStyle(entry.tintProgress > 0.5 ? Color.white.opacity(0.9) : Color(hex: 0x5F6B66))

            // TODO(friends): フレンド機能のバックエンドができたら「フレンドが筋トレ中」を表示する。
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(background, for: .widget)
        .widgetURL(URL(string: "mobile://workout/prepare"))
    }

    private func mix(_ a: Color, _ b: Color, fraction: Double) -> Color {
        let f = min(max(fraction, 0), 1)
        let ca = UIColor(a).components
        let cb = UIColor(b).components
        return Color(
            red: ca.r + (cb.r - ca.r) * f,
            green: ca.g + (cb.g - ca.g) * f,
            blue: ca.b + (cb.b - ca.b) * f
        )
    }
}

struct ZuboraStreakWidget: Widget {
    let kind: String = "ZuboraStreakWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            ZuboraStreakWidgetView(entry: entry)
        }
        .configurationDisplayName("連続記録")
        .description("筋トレの連続日数。タップで即スタート。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 色ユーティリティ

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension UIColor {
    var components: (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }
}

#Preview(as: .systemSmall) {
    ZuboraStreakWidget()
} timeline: {
    StreakEntry(date: .now, streakDays: 5, tintProgress: 0.1, doneToday: false)
    StreakEntry(date: .now, streakDays: 5, tintProgress: 0.9, doneToday: false)
    StreakEntry(date: .now, streakDays: 6, tintProgress: 0.0, doneToday: true)
}
