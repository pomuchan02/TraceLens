/**
 * ===============================
 * SQL2ER - DDL to ER Diagram Generator
 * メイン処理ロジック
 * ===============================
 * 
 * 6段階のパイプライン処理:
 * 1. クエリ検証 → 2. クエリ解析 → 3. テーブル抽出
 * 4. 関係推測 → 5. ER図生成 → 6. UI表示 & エクスポート準備
 */

const button = document.querySelector('.Create2ER-StartButton');
button.addEventListener('click', () => {
    console.log('=== 生成開始 ===');
    try {
        // ① クエリ入力値を取得
        const query = document.querySelector('.create-query').value.trim();
        if (!query) {
            alert('クエリを入力してください');
            return;
        }

        document.querySelector('.create-generate-result').classList.add('active');

        // ② クエリの妥当性を検証
        validateQuery(query);
        
        // ③ DDLを解析してCREATE TABLE文に分割
        const tables = extractTables(parseQuery(query));
        
        // ④ テーブル間の関係をFOREIGN KEY制約と命名規則から推測
        const relationships = inferRelationships(tables);
        
        // ⑤ Mermaidコードを生成
        const mermaidCode = generateMermaidDiagram(tables, relationships);
        
        // ⑥ UIに表示 & Mermaidエクスポート準備
        displayDiagram(mermaidCode, 'createErDiagram');
        prepareExcelExport(tables, relationships, mermaidCode);

    } catch (error) {
        console.error(`エラー: ${error.message}`);
        alert(`エラー: ${error.message}`);
    } finally {
        console.log('=== 生成終了 ===');
    }
});

/**
 * ===============================
 * ① クエリ検証
 * ===============================
 * 入力されたDDLが有効であることを確認
 * - 空でないことを確認
 * - CREATE TABLE文を含むことを確認
 * 
 * @param {string} query - ユーザーが入力したDDL
 * @throws {Error} 検証失敗時
 */
function validateQuery(query) {
    if (!query || query.length === 0) {
        throw new Error('クエリが空です');
    }
    if (!/CREATE\s+TABLE/i.test(query)) {
        throw new Error('CREATE TABLE文が見つかりません');
    }
}

/**
 * ===============================
 * ② クエリ解析
 * ===============================
 * 複数のCREATE TABLE文を分割抽出
 * セミコロンで区切られた文を個別に抽出（複数テーブル対応）
 * 
 * @param {string} query - 入力されたDDL（複数のCREATE TABLE文を含む可能性）
 * @returns {Array<string>} 個別のCREATE TABLE文の配列
 * @example
 * Input: "CREATE TABLE users (...); CREATE TABLE orders (...);"
 * Output: ["CREATE TABLE users (...)", "CREATE TABLE orders (...)"]
 */
function parseQuery(query) {
    const statements = query
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && /CREATE\s+TABLE/i.test(stmt));

    if (statements.length === 0) {
        throw new Error('有効なCREATE TABLE文が見つかりません');
    }
    return statements;
}

/**
 * ===============================
 * ③ テーブル情報抽出
 * ===============================
 * CREATE TABLE文からテーブル情報をJSON化
 * 抽出内容:
 * - テーブル名
 * - カラン定義（名前、データ型、属性）
 * - PRIMARY KEY（複合主キーにも対応）
 * - FOREIGN KEY制約（外部キー関連を後で利用）
 * 
 * @param {Array<string>} statements - CREATE TABLE文の配列
 * @returns {Array<Object>} テーブルオブジェクトの配列
 * @example
 * Output[0]: {
 *   name: 'users',
 *   columns: [{name: 'id', type: 'INT', isPrimaryKey: true, ...}],
 *   primaryKeys: ['id'],
 *   primaryKey: 'id',
 *   foreignKeyConstraints: []
 * }
 */
function extractTables(statements) {
    return statements.map(statement => {
        // テーブル名を正規表現で抽出
        // 対応パターン: CREATE TABLE `table_name` ( ... )
        //             CREATE TABLE table_name ( ... )
        const tableNameMatch = statement.match(/CREATE\s+TABLE\s+[`"]?(\w+)[`"]?\s*\(/i);
        if (!tableNameMatch) return null;

        const tableName = tableNameMatch[1].toLowerCase();
        const defStart = statement.indexOf('(');
        const defEnd = statement.lastIndexOf(')');
        
        if (defStart === -1 || defEnd === -1) {
            throw new Error(`${tableName}: カラム定義が見つかりません`);
        }

        // カラム定義部分（括弧内）を抽出して解析
        const columns = parseColumns(statement.substring(defStart + 1, defEnd));
        
        // PRIMARY KEY句を抽出（複合主キー対応）
        // パターン: PRIMARY KEY (col1) または PRIMARY KEY (col1, col2)
        const pkMatch = statement.match(/PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/i);
        const primaryKeys = pkMatch 
            ? pkMatch[1].split(',').map(col => col.trim().replace(/[`"]/g, '').toLowerCase())
            : [];

        // 主キーのカラムに isPrimaryKey フラグを設定
        primaryKeys.forEach(pkName => {
            const col = columns.find(c => c.name === pkName);
            if (col) col.isPrimaryKey = true;
        });

        return {
            name: tableName,
            columns: columns,
            primaryKeys: primaryKeys,  // 複数主キー用の配列
            primaryKey: primaryKeys[0] || null,  // 互換性のため第1主キーを格納
            foreignKeyConstraints: extractForeignKeyConstraints(statement)  // 外部キー情報
        };
    }).filter(Boolean);  // null値を除外
}

/**
 * ===============================
 * ③-1 カラン定義をパース
 * ===============================
 * CREATE TABLE文のカラム定義部分を解析
 * 処理の流れ:
 * 1. PRIMARY KEY（...）、FOREIGN KEY（...）などの制約句を事前に削除
 * 2. コンマで各カラン行に分割
 * 3. 各行からカラム名、型、属性を抽出
 * 
 * 対応される型:
 * - VARCHAR(255), CHAR(100), TEXT
 * - INT, BIGINT, DECIMAL(10,2)
 * - DATE, DATETIME, TIMESTAMP
 * - BOOLEAN など
 * 
 * @param {string} columnDefString - カラン定義部分の文字列
 * @returns {Array<Object>} カランオブジェクトの配列
 * @example
 * Output[0]: {
 *   name: 'id',
 *   type: 'INT',
 *   isPrimaryKey: false,  // 後で主キー判定で更新
 *   isForeignKey: false,  // 後で関係推測で更新
 *   foreignKey: null,
 *   isNullable: false,
 *   isAutoIncrement: true
 * }
 */
function parseColumns(columnDefString) {
    // 制約句を事前に削除 (PRIMARY KEY、FOREIGN KEY、CONSTRAINTなど)
    let cleaned = columnDefString
        .replace(/PRIMARY\s+KEY\s*\([^)]*\)/gi, '')           // PRIMARY KEY(...)を削除
        .replace(/FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+[^;]*/gi, '')  // FOREIGN KEY...を削除
        .replace(/CONSTRAINT\s+\w+[^,]*/gi, '');              // CONSTRAINT...を削除

    return cleaned
        .split(',')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // カラム名を抽出（バッククォート・ダブルクォート対応）
            const colMatch = line.match(/^[`"]?(\w+)[`"]?\s+/);
            if (!colMatch) return null;
            
            const name = colMatch[1].toLowerCase();
            
            // データ型を抽出（括弧内のパラメータも一緒に）
            // 例: VARCHAR(255) → VARCHAR(255)
            //     INT         → INT
            const typeMatch = line.match(/^[`"]?\w+[`"]?\s+([\w]+(?:\([^)]*\))?)/);
            const type = typeMatch ? typeMatch[1].trim() : 'string';
            
            // インライン形式の PRIMARY KEY を検出 (例: INT PRIMARY KEY AUTO_INCREMENT)
            const hasInlinePrimaryKey = /\bPRIMARY\s+KEY\b/i.test(line);
            
            return {
                name,
                type,
                isPrimaryKey: hasInlinePrimaryKey,  // インラインPKを検出
                isForeignKey: false,  // 後で関係推測で設定
                foreignKey: null,     // {refTable, refColumn} フォーマット
                isNullable: !line.toUpperCase().includes('NOT NULL'),
                isAutoIncrement: /AUTO_INCREMENT|IDENTITY/i.test(line)
            };
        })
        .filter(Boolean);  // null値を除外
}

/**
 * ===============================
 * ③-2 外部キー制約を抽出
 * ===============================
 * CREATE TABLE文のFOREIGN KEY句から外部キー情報を抽出
 * 複数の外部キー、複合外部キーに対応
 * 
 * 対応パターン:
 * - 単純なFK: FOREIGN KEY (user_id) REFERENCES users(id)
 * - 複合FK:  FOREIGN KEY (user_id, org_id) REFERENCES users(id, org_id)
 * - 制約名付き: CONSTRAINT fk_user FOREIGN KEY (...) REFERENCES (...)
 * 
 * @param {string} statement - CREATE TABLE文
 * @returns {Array<Object>} 外部キー制約の配列
 * @example
 * Output: [
 *   {column: 'user_id', refTable: 'users', refColumn: 'id'},
 *   {column: 'org_id', refTable: 'organization', refColumn: 'id'}
 * ]
 */
function extractForeignKeyConstraints(statement) {
    const foreignKeys = [];
    // FOREIGN KEY制約を正規表現で抽出
    // パターン: FOREIGN KEY (col1,col2,...) REFERENCES table(refCol1,refCol2,...)
    const fkPattern = /FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s+REFERENCES\s+[`"]?(\w+)[`"]?\s*\(\s*([^)]+)\s*\)/gi;
    let fkMatch;

    while ((fkMatch = fkPattern.exec(statement)) !== null) {
        const columnParts = fkMatch[1].split(',').map(col => col.trim().replace(/[`"]/g, ''));
        const refTable = fkMatch[2].toLowerCase();
        const refColumnParts = fkMatch[3].split(',').map(col => col.trim().replace(/[`"]/g, ''));

        // 複合外部キーの場合、インデックスでマッピング
        columnParts.forEach((col, index) => {
            foreignKeys.push({
                column: col.toLowerCase(),
                refTable: refTable,
                refColumn: refColumnParts[index] || refColumnParts[0]  // マッピングがない場合は第1カラムを使用
            });
        });
    }
    return foreignKeys;
}

/**
 * ===============================
 * ④ 関係推測
 * ===============================
 * テーブル間の外部キー関係を2段階で推測
 * 
 * 処理フロー:
 * 1. テーブル名マップを作成（単数形・複数形両対応）
 * 2. 各カラムについて以下を確認:
 *    - 優先1: FOREIGN KEY制約で明示的に定義されているか
 *    - 優先2: カラム名から推測可能か（user_id, userId等）
 * 3. 推測できた場合、リレーションシップを記録
 * 4. カランに isForeignKey フラグと foreignKey情報を設定
 * 
 * 例:
 * - orders テーブルの user_id カラム → users.id への参照推測
 * - posts テーブルの authorId カラム → users.id への参照推測
 * 
 * @param {Array<Object>} tables - テーブル情報の配列
 * @returns {Array<Object>} 推測されたリレーションシップの配列
 * @example
 * Output: [
 *   {
 *     fromTable: 'orders',
 *     fromColumn: 'user_id',
 *     toTable: 'users',
 *     toColumn: 'id',
 *     type: 'foreign_key'  // または 'inferred'
 *   }
 * ]
 */
function inferRelationships(tables) {
    const relationships = [];
    const tableNameMap = new Map();

    // テーブル名マップを作成（テーブル名と複数形の両方で検索可能に）
    // 例: 'user' にアクセス → users テーブル メソドで見つかる
    tables.forEach(table => {
        tableNameMap.set(table.name.toLowerCase(), table);
        tableNameMap.set(toPlural(table.name).toLowerCase(), table);
    });

    tables.forEach(table => {
        table.columns.forEach(column => {
            let fkInfo = null;

            // 優先1: FOREIGN KEY制約で明示的に定義されているか確認
            if (table.foreignKeyConstraints?.length > 0) {
                const explicit = table.foreignKeyConstraints.find(
                    fk => fk.column.toLowerCase() === column.name.toLowerCase()
                );
                if (explicit) {
                    fkInfo = {
                        table: explicit.refTable,
                        column: explicit.refColumn,
                        type: 'foreign_key'  // 明示的なFOREIGN KEY制約
                    };
                }
            }

            // 優先2: 明示的なFKがない場合、カラン命名規則から推測
            if (!fkInfo) {
                const inferred = inferForeignKeyFromName(column.name, tableNameMap);
                if (inferred) {
                    fkInfo = {
                        ...inferred,
                        type: 'inferred'  // 命名規則から推測
                    };
                }
            }

            // 推測できた関係がある場合、リレーションシップを記録
            if (fkInfo) {
                relationships.push({
                    fromTable: table.name,
                    fromColumn: column.name,
                    toTable: fkInfo.table,
                    toColumn: fkInfo.column,
                    type: fkInfo.type
                });

                // カランデータにも外部キー情報を反映
                column.isForeignKey = true;
                column.foreignKey = {
                    refTable: fkInfo.table,
                    refColumn: fkInfo.column
                };
            }
        });
    });

    return relationships;
}

/**
 * ===============================
 * ④-1 命名規則から外部キーを推測
 * ===============================
 * カラン名のパターンから参照先テーブルを推測
 * 複数の命名規則に対応
 * 
 * 対応パターン:
 * 1. スネークケース: user_id, order_id → user, order テーブルを検索
 * 2. キャメルケース: userId, orderId → user, order テーブルを検索
 * 3. 大文字キャメル: userID, orderID → user, order テーブルを検索
 * 4. その他の外部キー名: user_code, order_key, item_ref
 * 
 * 検索の優先順位:
 * 1. テーブル名と完全一致
 * 2. テーブル名の複数形で検索（user → users）
 * 3. テーブル名の単数形で検索（users → user）
 * 
 * @param {string} columnName - カラン名
 * @param {Map} tableNameMap - テーブル名マップ {テーブル名: テーブルオブジェクト}
 * @returns {Object|null} {table: 'users', column: 'id'} または null
 * @example
 * Input: 'user_id', tableNameMap: {'users': {...}, 'orders': {...}}
 * Output: {table: 'users', column: 'id'}
 */
function inferForeignKeyFromName(columnName, tableNameMap) {
    // カラン名から参照先テーブル名を抽出するパターンの配列
    const patterns = [
        /^(\w+)_id$/,           // user_id, order_id 等
        /^([a-z]+)Id$/,         // userId, orderId 等
        /^([a-z]+)ID$/,         // userID, orderID 等
        /^(\w+)_(code|key|ref)$/ // user_code, order_key, item_ref 等
    ];

    for (const regex of patterns) {
        const match = columnName.toLowerCase().match(regex);
        if (match) {
            const refName = match[1].toLowerCase();  // 抽出された参照テーブル候補
            
            // パターン順に検索
            // 1. テーブル名と完全一致を検索
            if (tableNameMap.has(refName)) {
                return { table: tableNameMap.get(refName).name, column: 'id' };
            }
            
            // 2. 複数形で検索（user → users）
            const plural = toPlural(refName);
            if (tableNameMap.has(plural)) {
                return { table: tableNameMap.get(plural).name, column: 'id' };
            }
            
            // 3. 単数形で検索（users → user）
            const singular = toSingular(refName);
            if (tableNameMap.has(singular)) {
                return { table: tableNameMap.get(singular).name, column: 'id' };
            }
        }
    }
    return null;  // マッチングしません。明示的なFOREIGN KEYをユーザー定義
}

/**
 * ===============================
 * ⑤ ER図生成（Mermaid形式）
 * ===============================
 * テーブルと関係情報からMermaidのER図定義を生成
 * 
 * Mermaid 11.13.0 のER図シンタックス:
 * erDiagram
 *   ENTITY_NAME {
 *     type column_name PK  <- Primary Key
 *     type column_name FK  <- Foreign Key
 *     type column_name     <- Regular column
 *   }
 *   TABLE1 ||--o{ TABLE2 : "LABEL"
 * 
 * 処理内容:
 * 1. エンティティ定義: 各テーブルとカラン情報をMermaid形式に変換
 * 2. 型マッピング: DBの型をMermaid互換型に正規化
 * 3. 制約表示: PK（主キー）とFK（外部キー）を属性として表示
 * 4. 関係定義: テーブル間のリレーションシップを矢印で接続
 * 
 * @param {Array<Object>} tables - テーブルジェクトの配列
 * @param {Array<Object>} relationships - リレーションシップの配列
 * @returns {string} MermaidのER図定義コード
 * @example
 * Output:
 * erDiagram
 *   USERS {
 *     int id PK
 *     varchar username
 *     varchar email
 *   }
 *   ORDERS {
 *     int order_id PK
 *     int user_id FK
 *     decimal total
 *   }
 *   USERS ||--o{ ORDERS : "USERS.user_id"
 */
function generateMermaidDiagram(tables, relationships) {
    let mermaidCode = 'erDiagram\n';

    // データベース型をMermaid対応型にマッピング
    // Mermaid ERD対応の基本型のみ使用
    const typeMap = {
        'varchar': 'varchar', 'char': 'char', 'text': 'text',
        'int': 'int', 'integer': 'int', 'bigint': 'bigint',
        'decimal': 'decimal', 'numeric': 'numeric', 'float': 'float',
        'date': 'date', 'datetime': 'datetime', 'timestamp': 'timestamp',
        'boolean': 'boolean', 'bool': 'boolean'
    };

    // ステップ1: エンティティ定義（各テーブルとカラン情報）
    tables.forEach(table => {
        const entityName = table.name.toUpperCase();  // Mermaidでは大文字が慣例
        mermaidCode += `    ${entityName} {\n`;

        table.columns.forEach(column => {
            // データ型の正規化
            // VARCHAR(255) → varchar, DECIMAL(10,2) → decimal
            const baseType = column.type.toLowerCase().split('(')[0].trim();
            const typeStr = typeMap[baseType] || 'string';
            
            // 制約フラグをMermaid形式で表現
            // PK = Primary Key, FK = Foreign Key
            const constraint = column.isPrimaryKey ? ' PK' : (column.isForeignKey ? ' FK' : '');
            
            // Mermaid形式: type column_name [constraint]
            mermaidCode += `        ${typeStr} ${column.name}${constraint}\n`;
        });

        mermaidCode += `    }\n`;
    });

    // ステップ2: 関係定義（テーブル間のリレーションシップ）
    const tableNames = new Set(tables.map(t => t.name.toLowerCase()));
    
    relationships.forEach(rel => {
        const fromTable = rel.fromTable.toLowerCase();
        const toTable = rel.toTable.toLowerCase();

        // 有効性チェック:
        // - 両方のテーブルが定義されているか確認
        // - 自己参照（同じテーブルへの参照）を除外
        if (tableNames.has(fromTable) && tableNames.has(toTable) && fromTable !== toTable) {
            const fromTableUpper = rel.fromTable.toUpperCase();
            const toTableUpper = rel.toTable.toUpperCase();
            
            // Mermaid形式: TABLE1 ||--o{ TABLE2 : "LABEL"
            // ||--o{ は「1対多」を示す線
            mermaidCode += `    ${fromTableUpper} ||--o{ ${toTableUpper} : "${fromTableUpper}.${rel.fromColumn}"\n`;
        }
    });

    console.log('生成されたMermaidコード:');
    console.log(mermaidCode);
    
    return mermaidCode;
}

/**
 * ===============================
 * ⑥ ER図表示
 * ===============================
 * 生成したMermaidコードをHTMLの#erDiagramに挿入
 * Mermaid.jsライブラリがあれば自動的にレンダリング
 * 
 * @param {string} mermaidDiagram - Mermaid形式のER図定義コード
 */
function displayDiagram(mermaidDiagram) {
    const outputArea = document.querySelector('#createErDiagram');
    if (outputArea) {
        // Mermaidのコードを <pre class="mermaid">...</pre> 形式でHTML要素に挿入
        outputArea.innerHTML = `<pre class="mermaid">${mermaidDiagram}</pre>`;
        
        // Mermaid.jsが読み込まれている場合、レンダリング実行
        if (typeof mermaid !== 'undefined') {
            mermaid.contentLoaded();  // 新しいDOM要素をスキャンしてレンダリング
        }
    }
}

/**
 * ===============================
 * ⑦-1 Mermaidエクスポート準備
 * ===============================
 * Mermaidコード、テーブル情報をグローバルに保存
 * ダウンロードボタンのクリックハンドラを設定
 * 
 * 保存される情報:
 * - mermaidCode: 生成されたMermaidのER図コード
 * - tables: テーブル定義と全カラン情報
 * - relationships: テーブル間の関係
 * - generatedAt: ER図生成日時
 * 
 * @param {Array<Object>} tables - テーブル情報
 * @param {Array<Object>} relationships - リレーションシップ情報
 * @param {string} mermaidCode - 生成されたMermaidコード
 */
function prepareExcelExport(tables, relationships, mermaidCode) {
    // グローバルオブジェクトにデータを保存
    window.exportData = {
        mermaidCode: mermaidCode,
        tables: tables,
        relationships: relationships,
        generatedAt: new Date().toLocaleString('ja-JP')
    };

    // ダウンロードボタンを有効化
    const downloadBtn = document.querySelector('.create-downloadButton');
    if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.addEventListener('click', downloadAsMermaidAndPNG);
    }
}

/**
 * ===============================
 * ⑦-2 Mermaid + PNGダウンロード
 * ===============================
 * 生成したER図をMermaidコード(.mmd)とPNG画像として一緒にダウンロード
 * 
 * 出力ファイル:
 * - .mmd ファイル: Mermaidテキスト形式（他のツールでも編集可能）
 * - .png ファイル: ER図の画像（そのまま資料に貼り付け可能）
 * 
 * ファイル名形式: ER_[タイムスタンプ].mmd, ER_[タイムスタンプ].png
 * 例) ER_1726547893000.mmd, ER_1726547893000.png
 */
async function downloadAsMermaidAndPNG() {
    if (!window.exportData) {
        alert('先にER図を生成してください');
        return;
    }

    try {
        const timestamp = new Date().getTime();
        
        // ① Mermaidコードを .mmd ファイルでダウンロード
        const mermaidCode = window.exportData.mermaidCode;
        const mmdBlob = new Blob([mermaidCode], { type: 'text/plain' });
        const mmdUrl = URL.createObjectURL(mmdBlob);
        const mmdLink = document.createElement('a');
        mmdLink.href = mmdUrl;
        mmdLink.download = `ER_${timestamp}.mmd`;
        document.body.appendChild(mmdLink);
        mmdLink.click();
        document.body.removeChild(mmdLink);
        URL.revokeObjectURL(mmdUrl);

        // ② SVGをPNGに変換してダウンロード
        // 少し遅延を入れてから実行（mmdダウンロードが完了するのを待つ）
        setTimeout(() => {
            const erDiagramDiv = document.querySelector('#createErDiagram');
            if (erDiagramDiv) {
                // html2canvasライブラリで要素をキャプチャ
                if (typeof html2canvas !== 'undefined') {
                    html2canvas(erDiagramDiv, {
                        backgroundColor: '#ffffff',
                        scale: 2,
                        logging: false
                    }).then(canvas => {
                        canvas.toBlob(blob => {
                            const pngUrl = URL.createObjectURL(blob);
                            const pngLink = document.createElement('a');
                            pngLink.href = pngUrl;
                            pngLink.download = `ER_${timestamp}.png`;
                            document.body.appendChild(pngLink);
                            pngLink.click();
                            document.body.removeChild(pngLink);
                            URL.revokeObjectURL(pngUrl);
                        }, 'image/png');
                    }).catch(error => {
                        console.warn('PNG変換に失敗:', error);
                        alert('PNG画像の生成に失敗しました。Mermaidコード(.mmd)のみ提供します。');
                    });
                } else {
                    // html2canvasがない場合、SVG→PNG変換を代替実装
                    convertSvgToPng(erDiagramDiv, `ER_${timestamp}.png`);
                }
            }
        }, 500);

        alert('Mermaidコード(.mmd)をダウンロード中...\n※ PNG画像も別途ダウンロードされます');

    } catch (error) {
        alert(`ダウンロード失敗: ${error.message}`);
    }
}

/**
 * ===============================
 * SVG→PNG変換（フォールバック実装）
 * ===============================
 * html2canvasがない場合の代替方法
 * SVGをCanvasに描画してPNG化
 * 
 * @param {HTMLElement} element - ER図要素
 * @param {string} filename - 保存ファイル名
 */
function convertSvgToPng(element, filename) {
    try {
        const svg = element.querySelector('svg');
        if (!svg) {
            throw new Error('SVG要素が見つかりません');
        }

        // SVGをシリアライズ
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(svgBlob);

        // svg→canvas変換
        const ctx = element.ownerDocument.defaultView;
        if (!ctx) throw new Error('Document contextが取得できません');

        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const canvasCtx = canvas.getContext('2d');
            canvasCtx.drawImage(img, 0, 0);

            canvas.toBlob(blob => {
                const pngUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = pngUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(pngUrl);
            }, 'image/png');

            URL.revokeObjectURL(svgUrl);
        };
        img.onerror = function() {
            throw new Error('SVG画像の読み込みに失敗しました');
        };
        img.src = svgUrl;

    } catch (error) {
        console.error('SVG→PNG変換エラー:', error);
        alert('PNG画像の変換に失敗しました。Mermaidコード(.mmd)ファイルをご利用ください。');
    }
}

// ========================================================
// ユーティリティ関数
// ========================================================

/**
 * 単数形を複数形に変換
 * 簡易的な英語複数形ルールに対応
 * 
 * 対応ルール:
 * - ...y → ...ies    (user → users, category → categories)
 * - ...s|ss|x|z → ...es  (class → classes, box → boxes)
 * - その他 → ...s  (table → tables)
 * 
 * @param {string} word - 単数形の単語
 * @returns {string} 複数形の単語
 * @example
 * toPlural('user') → 'users'
 * toPlural('category') → 'categories'
 */
function toPlural(word) {
    if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
    if (/s|ss|x|z$/.test(word)) return word + 'es';
    return word + 's';
}

/**
 * 複数形を単数形に変換
 * 簡易的な逆変換ルールに対応
 * 
 * 対応ルール:
 * - ...ies → ...y    (users → user, categories → category)
 * - ...es → ...      (classes → class)
 * - ...s → ...       (tables → table)
 * 
 * @param {string} word - 複数形の単語
 * @returns {string} 単数形の単語
 * @example
 * toSingular('users') → 'user'
 * toSingular('categories') → 'category'
 */
function toSingular(word) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es')) return word.slice(0, -2);
    if (word.endsWith('s')) return word.slice(0, -1);
    return word;
}

// ========================================================
// UI イベント処理
// ========================================================

/**
 * タブ切替イベント処理
 * .tab-heads内のタブボタンをクリックして対応するタブを表示
 */
const tabs = document.querySelector('.tab-heads');
if (tabs) {
    tabs.addEventListener('click', (e) => {
        const head = e.target.closest('.tab-head');
        if (head) switchTab(head.dataset.tab);
    });
}

/**
 * 文字数カウンター機能
 * textareaの入力文字数をリアルタイムで表示
 * 上限（2000文字）を超えた場合は色を赤に変更
 */
const textarea = document.getElementById('query');
const charCounter = document.getElementById('charCounter');
const maxLength = 2000;
if (textarea && charCounter) {
    textarea.addEventListener('input', () => {
        const length = textarea.value.length;
        // 「現在文字数 / 最大文字数」を表示
        charCounter.textContent = `${length} / ${maxLength}`;
        // 上限超過時は赤色
        charCounter.style.color = length > maxLength ? 'red' : '';
    });
}

/**
 * タブ表示を切り替える
 * クリックされたタブを activeクラスで強調
 * 対応するタブコンテンツを表示
 * 
 * @param {string} id - 表示するタブのdata-tab属性値
 */
function switchTab(id) {
    // すべてのタブヘッダーのactiveクラスを以下の基準で更新
    document.querySelectorAll('.tab-head').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === id);
    });
    // すべてのタブボディのactiveクラスを以下の基準で更新
    document.querySelectorAll('.tab-body').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === id);
    });
}
