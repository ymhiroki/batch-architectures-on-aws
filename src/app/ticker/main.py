import os
import time
from datetime import datetime

sfn_task_input = os.getenv('SFN_TASK_INPUT', '"no input"')
print(f"SFN_TASK_INPUT: {sfn_task_input}")

# 開始時刻を記録
start_time = time.time()
end_time = start_time + 60  # 1分間実行

while time.time() < end_time:
    # 現在の日時を取得
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ログを出力
    print(f"[{current_time}] ログ出力: {int(time.time() - start_time)}秒経過")

    # 1秒待機
    time.sleep(1)

print("60秒間のログ出力が完了しました。")
