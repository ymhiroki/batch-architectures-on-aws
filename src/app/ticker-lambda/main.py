import time
from datetime import datetime
import logging

# ロガーの設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    start_time = time.time()
    end_time = start_time + 60  # 1分間実行

    while time.time() < end_time:
        # 現在の日時を取得
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # ログを出力
        logger.info(f"[{current_time}] ログ出力: {
                    int(time.time() - start_time)}秒経過")
        time.sleep(1)  # 1秒待機

    logger.info("60秒間のログ出力が完了しました。")

    return {
        'statusCode': 200,
        'body': 'Logging completed'
    }
