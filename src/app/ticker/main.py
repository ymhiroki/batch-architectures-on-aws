import time
from datetime import datetime

# 開始時刻を記録
start_time = time.time()

# 1分間（60秒）ループを続ける
while time.time() - start_time < 60:
    # 現在の日時を取得
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # ログを出力
    print(f"[{current_time}] ログ出力: {int(time.time() - start_time)}秒経過")
    
    # 1秒待機
    time.sleep(1)

print("1分間のログ出力が完了しました。")
