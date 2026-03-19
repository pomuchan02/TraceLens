# TraceLens
Javaエラーログ解析ツール
Java Stack Trace Analyzer

＜概要＞
Javaのエラーログを張り付けることで
エラー発生個所を特定します。

＜ターゲット＞
・Java初学者
・運用保守フェーズ

＜詳細＞
・例外名
　ログに「Caused by...」がある場合はCaused byに記載されているException名を表示
  ※複数Caused byがある場合：最後のCaused byを抽出しています

・エラー内容
　Exceptionのメッセージを抽出して表示

・エラー発生クラス・行
　「at ...」から特定
　※Native MethodやUnknown Sourceの場合は表示しません