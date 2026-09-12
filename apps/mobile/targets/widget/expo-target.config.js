/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "widget",
  displayName: "ズボラ筋トレ",
  icon: "../../assets/images/icon.png",
  colors: {
    // WorkoutColors.primary / screenBg（constants/workout-theme.ts と揃える）
    $accent: "#1D9E75",
    $widgetBackground: "#F4F7F5",
  },
  entitlements: {
    // メインアプリ（app.json の ios.entitlements）と同じ App Group を共有する。
    // これがないと RN 側から書いた UserDefaults をウィジェットが読めない。
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
