FROM public.ecr.aws/lambda/python:3.12

# アプリケーションディレクトリをコピー
COPY main.py ${LAMBDA_TASK_ROOT}

# ハンドラを指定
CMD [ "main.lambda_handler" ]
