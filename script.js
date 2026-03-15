/**
 * エラーログ解析
 */
const button = document.querySelector('button.btn-primary');
button.addEventListener('click', () => {
    console.log('解析開始');

    // エラーログ取得
    const log = document.querySelector('textarea').value;
    if (!log) {
        alert('エラーログを入力してください');
        return;
    }

    // ログ内容確認
    const targetLog = getTargetLog(log);

    // 例外名の抽出
    const exceptionName = extractException(targetLog);
    document.getElementById('exceptionName').textContent = exceptionName || '見つかりませんでした';

    // エラー内容の抽出
    const errorMessage = extractErrorMessage(targetLog);
    document.getElementById('causedBy').textContent = errorMessage || '見つかりませんでした';

    // エラー発生個所の抽出
    const errorLines = extractErrorLine(targetLog);
    const errorPackage = errorLines ? errorLines[0] : null;
    const errorClass = errorLines ? errorLines[1] : null;
    const errorLine = errorLines ? errorLines[2] : null;
    document.getElementById('errorPackage').textContent = errorPackage || '見つかりませんでした';
    document.getElementById('errorClass').textContent = errorClass || '見つかりませんでした';
    document.getElementById('errorLine').textContent = errorLine || '見つかりませんでした';

    console.log('解析終了');
});

/**
 * タブ切替処理
 */
const tabs = document.querySelector('.tab-heads');
tabs.addEventListener('click', (e) => {

  const head = e.target.closest('.tab-head');
  if (!head) return;

  const id = head.dataset.tab;

  switchTab(id);

});

/**
 * 文字数カウンターの更新
 */
const textarea = document.getElementById('errorLog');
const maxLength = 500;
const charCounter = document.getElementById("charCounter");
textarea.addEventListener("input", () => {
    // 現在の文字数を取得する
    const currentLength = textarea.value.length;
  
    // 文字数が上限を超えたらカウンターの色を赤にする
    if (currentLength > maxLength) {
        charCounter.style.color = "red"
    } else {
        charCounter.style.removeProperty("color")
    }
    
    // 「現在文字数 / 最大文字数」というテキストを作成してカウンター部分に表示する
    document.getElementById('charCounter').textContent = `${currentLength} / ${maxLength}`;
});

/**
 * エラーログから解析対象のログを取得する
 * @param log エラーログ
 * @return 解析対象のログ
 */
function getTargetLog(log) {
    if (log.includes('Caused by:')) {
        const causedByBlocks = log.split('Caused by:');
        const lastBlock = causedByBlocks[causedByBlocks.length - 1];
        return "Caused by: " + lastBlock;
    } else {
        console.log('No Caused by lines found');
        return log;
    }
}

/**
 * 例外名を抽出する
 * @param log エラーログ
 * @return 例外名
 */
function extractException(log) {
    const exceptionRegex = /([\w.$]+(?:Exception|Error|Throwable))/;
    const match = log.match(exceptionRegex);
    if (match) {
        console.log('Exception found:', match[0]);
        return match[0];
    } else {
        console.log('No exception found');
    }
}

/**
 * エラー内容を抽出する
 * @param log エラーログ
 * @return Caused by行のExceptionメッセージ
 */
function extractErrorMessage(log) {
    const exMessageRegex = /(?:Caused by:\s+)?([\w.$]+(?:Exception|Error|Throwable)):\s+(.+)/;
    const matche = log.match(exMessageRegex);
    if(matche) {
        console.log('ErrorMessage lines found:', matche[1], ':', matche[2]);
        return matche[2];
    } else {
        console.log('No ErrorMessage lines found');
        return null;
    }
}

/**
 * エラー発生クラスを抽出する
 * @param log エラーログ
 * @return エラー発生クラスの配列 [パッケージ名, クラス名]
 */
function extractErrorLine(log) {
    const errorLineRegex =
        /at\s+([\w.$]+)\((?:([\w.$]+):(\d+)|Native Method|Unknown Source)\)/;
    const matchLine = log.match(errorLineRegex);
    if (matchLine) {
        console.log('Error lines found: 1:', matchLine[1], ', 2:', matchLine[2], ', 3:', matchLine[3]);
        return [matchLine[1], matchLine[2], matchLine[3]];
    } else {
        console.log('No error lines found');
        return [matchLine[1], matchLine[2], null];
    }
}

/**
 * アクティブタブを切り替える
 * @param id　切り替えるタブのID 
 */
function switchTab(id){

  document.querySelectorAll('.tab-head').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });

  document.querySelectorAll('.tab-body').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });

}