import React, { useEffect, useState } from 'react';
import { Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window'); // 画面の幅を取得

export default function WorkoutTimerScreen() {
  // 状態管理
  const [workoutTime, setWorkoutTime] = useState(900); // 初期値：15分（900秒）
  const [timeLeft, setTimeLeft] = useState(15); // 最初の準備時間（秒）
  const [isPreparing, setIsPreparing] = useState(true); // 準備中かどうかのフラグ
  const [isActive, setIsActive] = useState(true); // タイマーが動いているか

  // タイマーのカウントダウン処理（ボタン操作の影響を受けずに進む）
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (isPreparing) {
        // 準備時間が終わったら、本番の筋トレ時間に切り替え
        setIsPreparing(false);
        setTimeLeft(workoutTime);
      } else {
        // 筋トレ時間が終わったらタイマー停止
        setIsActive(false);
        alert('今日の目標筋トレ完了！AIロードマップを更新します！');
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, isPreparing, workoutTime]);

  // 秒を「分:秒」の形式に変換するヘルパー関数
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 5分（300秒）単位で筋トレ時間を変更する関数（準備中のみ変更可能）
  const changeTimeIn5MinSteps = (amount: number) => {
    if (!isPreparing) return; 
    setWorkoutTime((prev) => {
      const newTime = prev + amount;
      return newTime >= 300 ? newTime : 300; // 最低でも5分
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 右上のホームボタンエリア */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.homeButton}>
          {/* 簡易的な家アイコンの白いシルエット */}
          <View style={styles.homeIconRoof} />
          <View style={styles.homeIconBody} />
        </TouchableOpacity>
      </View>

      {/* メインタイマー表示 */}
      <View style={styles.timerWrapper}>
        <View style={styles.timerCircle}>
          <Text style={styles.timerLabel}>{isPreparing ? '準備時間' : '筋トレの残り時間'}</Text>
          <Text style={styles.timerNumber}>{formatTime(timeLeft)}</Text>
        </View>
      </View>

      {/* 設定・コントロールエリア */}
      <View style={styles.settingContainer}>
        <Text style={styles.settingTitle}>今日の筋トレ時間</Text>
        
        <View style={styles.counterRow}>
          {/* マイナスボタン */}
          <TouchableOpacity 
            style={[styles.stepButton, !isPreparing && styles.disabledButton]} 
            onPress={() => changeTimeIn5MinSteps(-300)} 
            disabled={!isPreparing}
          >
            <Text style={styles.stepButtonText}>- 5分</Text>
          </TouchableOpacity>

          {/* 現在の設定時間表示 */}
          <View style={styles.timeDisplayBox}>
            <Text style={styles.targetTimeText}>{Math.floor(workoutTime / 60)}</Text>
            <Text style={styles.minuteUnitText}>分</Text>
          </View>

          {/* プラスボタン */}
          <TouchableOpacity 
            style={[styles.stepButton, !isPreparing && styles.disabledButton]} 
            onPress={() => changeTimeIn5MinSteps(300)} 
            disabled={!isPreparing}
          >
            <Text style={styles.stepButtonText}>+ 5分</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// スタイルシート（お送りいただいたカンプ画像を再現）
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAEAEA', // 画像のような少し明るいグレーの背景
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  headerRow: {
    width: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 30,
    marginTop: 20,
  },
  homeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#8E8E8E', // ボタンのベースグレー
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 簡易的な家のアイコンパーツ
  homeIconRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  homeIconBody: {
    width: 18,
    height: 14,
    backgroundColor: '#FFFFFF',
    marginTop: -2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderBottomWidth: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  timerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCircle: {
    width: width * 0.68, // 画像のサイズ感に調整
    height: width * 0.68,
    borderRadius: (width * 0.68) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#8E8E8E', // 枠線のない、しっかりとしたグレー
    // 境界を綺麗に見せるための薄いシャドウ
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timerLabel: {
    fontSize: 16,
    color: '#FFFFFF', // 文字色は白
    marginBottom: 8,
    fontWeight: '500',
  },
  timerNumber: {
    fontSize: 58, // 少し大きく太く調整
    fontWeight: 'bold',
    color: '#FFFFFF', // 文字色は白
    letterSpacing: 1,
  },
  settingContainer: {
    width: '88%',
    backgroundColor: '#FFFFFF', // クッキリした白
    borderRadius: 24, // 綺麗な角丸
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    // カンプ画像のような綺麗な下方向へのシャドウ
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 30,
  },
  settingTitle: {
    fontSize: 15,
    color: '#333333',
    fontWeight: '600',
    marginBottom: 16,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  stepButton: {
    backgroundColor: '#959595', // ボタンの薄いグレー
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  disabledButton: {
    backgroundColor: '#E0E0E0',
  },
  stepButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timeDisplayBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  targetTimeText: {
    fontSize: 48, // 15の数字を大きく
    fontWeight: 'bold',
    color: '#000000', // クッキリとした黒
  },
  minuteUnitText: {
    fontSize: 24, // 「分」のサイズを画像比率に
    fontWeight: 'bold',
    color: '#000000',
    marginLeft: 2,
  },
});