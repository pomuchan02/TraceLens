/**
 * SQL整形処理
 */

const STATE = {
    ROOT: "ROOT",
    SELECT: "SELECT",
    DELETE: "DELETE",
    WHERE: "WHERE",
    IN: "IN",
    JOIN: "JOIN",
    ON: "ON",
    CASE: "CASE",
    SUBQUERY: "SUBQUERY"
};

const button = document.querySelector('button.btn-primary');
button.addEventListener('click', () => {
    console.log('=== 整形開始 ===');

    // SQL取得
    const sql = document.querySelector('textarea').value;
    if (!sql) {
        alert('SQLを入力してください');
        return;
    }

    try {
        const tokens = tokenize(sql);
        const formattedSQL = formatSQL(tokens);
        document.querySelector('.formatter-result').classList.add('active');
        renderSQL(formattedSQL);
    } catch (error) {
        alert('SQL整形中にエラーが発生しました: ' + error.message);
    }

    console.log('=== 整形終了 ===');
});

/**
 * コピーボタン
 */
document.getElementById("copyBtn").addEventListener("click", () => {
  const text = document.getElementById("formattedSql").textContent;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "Copied!";
    
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 1500);
  });
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
const maxLength = 2000;
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
 * SQLをトークンに分割する
 * @param {string} sql SQL文字列
 * @returns {string[]} トークンの配列
 */
function tokenize(sql) {
    const regex = new RegExp(
        "(?:" +
        "--.*?$|" +
        "'(?:''|[^'])*'|" +
        "\"(?:\\\\\"|[^\"])*\"|" +
        "\\bWITH\\b|\\bSELECT\\b|\\bINSERT\\b|\\bUPDATE\\b|\\bDELETE\\b|" +
        "\\bFROM\\b|\\bWHERE\\b|\\bLEFT\\s+JOIN\\b|\\bRIGHT\\s+JOIN\\b|" +
        "\\bINNER\\s+JOIN\\b|\\bOUTER\\s+JOIN\\b|\\bJOIN\\b|\\bON\\b|\\bGROUP\\s+BY\\b|\\bORDER\\s+BY\\b|" +
        "\\bCASE\\b|\\bWHEN\\b|\\bTHEN\\b|\\bELSE\\b|\\bEND\\b|" +
        "\\bVALUES\\b|\\bSET\\b|" +
        "\\bAS\\b|" +
        "[()\\,;]|" +
        "[^,\\s()]+" +
        ")",
        "gm"
    );

    return sql.match(regex).map(t => t.trim()).filter(Boolean);
}

/**
 * SQLを整形する
 * @param {string[]} tokens トークンの配列
 * @returns {string} 整形後のSQL文字列
 */
function formatSQL(tokens) {
    let result = "";
    let indent = 0;
    let state = STATE.ROOT;

    const INDENT = "    ";

    tokens.forEach(token => {
        const upper = token.toUpperCase();

        switch (upper) {
        case "SELECT":
        case "UPDATE":
        case "INSERT":
            if (!(state === STATE.IN)) {
                state = STATE.SELECT;
            }
            // 括弧内またはトップレベルでない場合は改行を追加
            if (result.endsWith('\n')) {
                result += INDENT.repeat(indent) + upper + "\n";
            } else {
                result += "\n" + INDENT.repeat(indent) + upper + "\n";
            }
            indent++;
            break;

        case "DELETE":
            state = STATE.DELETE;
            result += "\n" + INDENT.repeat(indent) + upper;
            break;

        case "FROM":
            if (!(state === STATE.DELETE)) {
                indent--;
            }
            result += "\n" + INDENT.repeat(indent) + "FROM\n";
            indent++;
            break;

        case "WHERE":
            indent--;
            result += "\n" + INDENT.repeat(indent) + "WHERE\n";
            indent++;
            if (!(state === STATE.IN)) {
                state = STATE.WHERE;
            }
            break;

        case "VALUES":
            result += "\nVALUES\n";
            indent++;
            break;

        case "GROUP":
        case "ORDER":
            if (upper === "GROUP" || upper === "ORDER") {
                indent--;
                result += "\n" + INDENT.repeat(indent) + upper + " ";
            }
            break;

        case "BY":
            result += upper + "\n";
            indent++;
            break;

        case "GROUP BY":
        case "ORDER BY":
            indent--;
            result += "\n" + INDENT.repeat(indent) + upper + "\n";
            indent++;
            break;

        case "LEFT":
        case "RIGHT":
        case "INNER":
        case "OUTER":
            result += upper + " ";
            break;

        case "JOIN":
            indent--;
            result += "\n" + INDENT.repeat(indent) + upper + "\n";
            indent++;
            state = STATE.JOIN;
            break;

        case "LEFT JOIN":
        case "RIGHT JOIN":
        case "INNER JOIN":
        case "OUTER JOIN":
            indent--;
            result += "\n" + INDENT.repeat(indent) + upper + "\n";
            indent++;
            state = STATE.JOIN;
            break;

        case "ON":
            result += "\n" + INDENT.repeat(indent) + "ON ";
            state = STATE.ON;
            break;
        
        case "SET":
            result += "\nSET\n";
            indent++;
            break;

        case "AND":
        case "OR":
            result += "\n" + INDENT.repeat(indent) + upper + " ";
            break;
        
        case "IN":
            // WHERE句内のINは改行なし、スペースのみ
            if (state === STATE.WHERE) {
                result += upper + " ";
            } else {
                result += "\n" + INDENT.repeat(indent) + upper + " ";
            }
            state = STATE.IN;
            break;

        case "CASE":
            indent--;
            result += INDENT.repeat(indent) + "CASE";
            indent += 2;
            state = STATE.CASE;
            break;

        case "WHEN":
        case "THEN":
        case "ELSE":
            result += "\n" + INDENT.repeat(indent) + upper + " ";
            break;

        case "END":
            indent--;
            result += "\n" + INDENT.repeat(indent) + "END ";
            state = STATE.ROOT;
            break;
        
        case "AS":
            result += "AS ";
            break;
        
        case "WITH":
            result += "\nWITH\n";
            indent++;
            break;

        case "(":
            // 前の行が改行で終わっている場合はインデントを追加
            if (result.endsWith('\n')) {
                result += INDENT.repeat(indent);
            }
            indent++;
            result += "( \n";
            break;

        case ")":
            if (state === STATE.IN) {
                indent -= 2;
            } else {
                indent--;
            }
            result += "\n" + INDENT.repeat(indent) + ")";
            break;

        case ",":
            result += ",\n" + INDENT.repeat(indent);
            break;

        case ";":
            result += ";";
            break;

        default:
            // 前の行が改行で終わっている場合はインデントを追加
            if (result.endsWith('\n')) {
                result += INDENT.repeat(indent);
            }
            result += token + " ";
        }

        indent = Math.max(indent, 0);
    });

    // 余分なスペースをクリーンアップ（半角スペースのみ）
    return result.trim().replace(/ +([,;])/g, '$1');
}


/**
 * 整形結果を表示
 * @param {string} formatted 整形されたSQL
 */
function renderSQL(formatted) {
  const codeEl = document.getElementById("formattedSql");
  codeEl.innerHTML = highlightSQL(formatted);
}

/**
 * SQLをハイライトする
 * @param {string} sql 
 * @returns {string} ハイライトされたSQL
 */
function highlightSQL(sql) {
  return sql
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|LEFT|RIGHT|INNER|OUTER|JOIN|GROUP|BY|ORDER|CASE|END|VALUE|SET|WITH)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(AND|OR|ON|WHEN|THEN|ELSE|AS|IN|HAVING)\b/g, '<span class="sbkw">$1</span>')
    .replace(/'(.*?)'/g, '<span class="str">\'$1\'</span>');
}

/**
 * アクティブタブを切り替える
 * @param {string} id 切り替えるタブのID 
 */
function switchTab(id){

  document.querySelectorAll('.tab-head').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });

  document.querySelectorAll('.tab-body').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });
}