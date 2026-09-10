import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 1. 使用するモデルファイルのパスを指定
# 先ほどダウンロードしたファイル名に統一します
model_path = 'pose_landmarker_full.task'

# 2. Tasks-API の設定
BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# 検出結果を保持するグローバル変数
latest_result = None

# リアルタイム（LIVE_STREAMモード）用のコールバック関数
def print_result(result: mp.tasks.vision.PoseLandmarkerResult, output_image: mp.Image, timestamp_ms: int):
    global latest_result
    latest_result = result

# 3. 検出器のオプション設定
# (※ base_options の末尾にカンマが抜けていたのを修正しました)
options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=print_result
)

# カメラの初期化 (0番のWebカメラ)
cap = cv2.VideoCapture(0)

# 4. 検出器（Landmarker）を起動してカメラ映像を処理
with PoseLandmarker.create_from_options(options) as landmarker:
    print("検出器が起動しました。'q' キーを押すと終了します。")
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("カメラ映像の取得に失敗しました。")
            break

        # MediaPipeで処理するために、画像をRGBに変換してMediaPipe Image形式にする
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        
        # ミリ秒単位のタイムスタンプを取得 (LIVE_STREAMモードでは必須です)
        timestamp_ms = int(cv2.getTickCount() / cv2.getTickFrequency() * 1000)
        
        # 非同期で姿勢推定を実行
        landmarker.detect_async(mp_image, timestamp_ms)

        # 描画処理（最新の検出結果がある場合）
        if latest_result is not None and latest_result.pose_landmarks:
            for pose_landmarks in latest_result.pose_landmarks:
                # 各関節の点を描画
                for landmark in pose_landmarks:
                    # 画面サイズに合わせて座標をピクセル値に変換
                    x = int(landmark.x * frame.shape[1])
                    y = int(landmark.y * frame.shape[0])
                    # 関節に緑色の丸を描く
                    cv2.circle(frame, (x, y), 5, (0, 255, 0), -1)

        # 画面に表示
        cv2.imshow('MediaPipe Tasks-API Pose', frame)

        # 'q' キーで終了
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()