import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# ==========================================
# 【NEW】全身が画面に映っているかチェックする関数
# ==========================================
def check_full_body_visible(landmarks):
    """
    主要な部位（肩・腰・膝・足首）が画面内に視認度高く映っているか確認
    """
    # 左側・右側の主要なキーポイントインデックス (肩, 腰, 膝, 足首)
    KEY_PARTS = [11, 12, 23, 24, 25, 26, 27, 28]
    
    for idx in KEY_PARTS:
        # 1. 視認信頼度(visibility)が 0.6 未満なら映っていないと判定
        if landmarks[idx].visibility < 0.6:
            return False
            
        # 2. 座標が画面の外枠からはみ出ていないか確認 (0.0 〜 1.0 の範囲内か)
        if not (0.0 <= landmarks[idx].x <= 1.0 and 0.0 <= landmarks[idx].y <= 1.0):
            return False
            
    return True

# ==========================================
# 【STEP 1】「骨格からベクトルを作る」関数
# ==========================================
def extract_vectors(pose_landmarks):
    """
    MediaPipeのランドマークから主要な部位のベクトル（矢印）を抽出する
    """
    # 座標を取得 (x, y)
    shoulder = np.array([pose_landmarks[11].x, pose_landmarks[11].y])  # 左肩
    hip      = np.array([pose_landmarks[23].x, pose_landmarks[23].y])  # 左腰
    knee     = np.array([pose_landmarks[25].x, pose_landmarks[25].y])  # 左膝
    ankle    = np.array([pose_landmarks[27].x, pose_landmarks[27].y])  # 左足首

    # 部位ごとのベクトル（終点 - 始点）
    torso_vec = shoulder - hip  # 上半身（腰 -> 肩）
    thigh_vec = knee - hip      # 大腿部（腰 -> 膝）
    shin_vec  = ankle - knee    # 下腿部（膝 -> 足首）

    return {
        "torso": torso_vec,
        "thigh": thigh_vec,
        "shin":  shin_vec
    }

# ==========================================
# 【STEP 3】「コサイン類似度」の計算関数
# ==========================================
def calculate_cosine_similarity(vec1, vec2):
    """2つのベクトルのコサイン類似度（-1.0 〜 1.0）を計算"""
    dot_product = np.dot(vec1, vec2)
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)
    
    if norm_vec1 == 0 or norm_vec2 == 0:
        return 0.0
        
    return dot_product / (norm_vec1 * norm_vec2)

def evaluate_form(user_vectors, ideal_vectors):
    """お手本ベクトルとユーザーベクトルの類似度を計算してスコア化（0〜100点）"""
    scores = []
    for part in ["torso", "thigh", "shin"]:
        sim = calculate_cosine_similarity(user_vectors[part], ideal_vectors[part])
        scores.append(sim)
    
    # 類似度の平均値を出し、100点満点に換算
    mean_sim = np.mean(scores)
    final_score = int(mean_sim * 100)
    return max(0, final_score)

# ==========================================
# 【STEP 2】「お手本画像」からベクトルを事前抽出する関数
# ==========================================
def get_ideal_vectors(image_path, model_path):
    """静止画モードでMediaPipeを実行し、お手本のベクトルを取得する"""
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE
    )
    
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        ideal_frame = cv2.imread(image_path)
        if ideal_frame is None:
            print(f"エラー: お手本画像 '{image_path}' が読み込めませんでした。")
            return None
            
        rgb_frame = cv2.cvtColor(ideal_frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        result = landmarker.detect(mp_image)
        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            print("✅ お手本画像からのベクトル抽出に成功しました！")
            return extract_vectors(result.pose_landmarks[0])
        else:
            print("エラー: お手本画像から人物を検出できませんでした。")
            return None

# ==========================================
# メイン処理（Webカメラ＆リアルタイム判定）
# ==========================================
def main():
    MODEL_PATH = "pose_landmarker_full.task"
    IDEAL_IMAGE_PATH = "ideal_squat.jpg"
    
    # 1. お手本ベクトルの取得
    ideal_vectors = get_ideal_vectors(IDEAL_IMAGE_PATH, MODEL_PATH)
    if ideal_vectors is None:
        return

    # 2. MediaPipe PoseLandmarkerの初期設定（VIDEOモード）
    base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO
    )
    
    # 状態管理用変数
    is_ready = False       # 【NEW】全身が確認できているかどうかのフラグ
    is_squatting = False
    max_hip_y = 0.0
    standing_threshold = 0.4  # 直立時の腰の目安位置
    
    latest_score = None
    squat_count = 0
    
    # 3. Webカメラの開始
    cap = cv2.VideoCapture(0)
    frame_timestamp_ms = 0

    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            # OpenCVのBGR画像をRGBに変換
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # VIDEOモード用のタイムスタンプ加算
            frame_timestamp_ms += 33
            
            # 姿勢推定の実行
            detection_result = landmarker.detect_for_video(mp_image, frame_timestamp_ms)
            
            # ランドマークが検出された場合の処理
            if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
                landmarks = detection_result.pose_landmarks[0]
                
                # --------------------------------------------------
                # 【フェーズ1】準備モード：全身が映っているかのチェック
                # --------------------------------------------------
                if not is_ready:
                    if check_full_body_visible(landmarks):
                        is_ready = True
                        print("✅ 全身を確認しました！スクワットを開始できます。")
                    else:
                        # 画面上に警告案内を表示
                        cv2.putText(frame, "Please show FULL BODY in camera", (30, 80), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

                # --------------------------------------------------
                # 【フェーズ2】計測モード：全身OKの時だけスクワット判定
                # --------------------------------------------------
                else:
                    # 安全装置：運動中に画面からフレームアウトしたら準備モードに戻す
                    if not check_full_body_visible(landmarks):
                        is_ready = False
                        is_squatting = False
                        print("⚠️ 人物が見切れました。全身を画面に映してください。")
                        continue

                    current_hip_y = landmarks[23].y  # 左腰のY座標
                    
                    # ① しゃがみ始めの検知
                    if current_hip_y > standing_threshold + 0.1:
                        is_squatting = True

                    # ② しゃがみ中の最深部チェック
                    if is_squatting:
                        if current_hip_y > max_hip_y:
                            max_hip_y = current_hip_y
                        
                        # 最深部を通過して立ち上がり始めた瞬間を検知
                        elif max_hip_y - current_hip_y > 0.03:
                            user_vectors = extract_vectors(landmarks)
                            latest_score = evaluate_form(user_vectors, ideal_vectors)
                            squat_count += 1
                            
                            is_squatting = False
                            max_hip_y = 0.0

                    # 骨格（主要な線）の描画
                    h, w, _ = frame.shape
                    points = {}
                    for idx in [11, 23, 25, 27]: # 肩, 腰, 膝, 足首
                        pt = landmarks[idx]
                        points[idx] = (int(pt.x * w), int(pt.y * h))
                        cv2.circle(frame, points[idx], 6, (0, 255, 0), -1)
                    
                    cv2.line(frame, points[11], points[23], (255, 255, 0), 2)
                    cv2.line(frame, points[23], points[25], (255, 255, 0), 2)
                    cv2.line(frame, points[25], points[27], (255, 255, 0), 2)

            # --- 情報の画面表示 ---
            if is_ready:
                # 全身認識OKの時はスコアとカウントを表示
                cv2.putText(frame, f"Count: {squat_count}", (30, 50), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
                
                if latest_score is not None:
                    color = (0, 255, 0) if latest_score >= 80 else (0, 0, 255)
                    cv2.putText(frame, f"Score: {latest_score}pt", (30, 110), 
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, color, 3)

            # 画面表示
            cv2.imshow("Squat Form Evaluation", frame)
            
            # 'q' キーで終了
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()