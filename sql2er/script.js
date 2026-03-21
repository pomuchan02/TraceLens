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

/**
 * ===============================
 * createER図生成のエントリポイント
 * ===============================
 */
const button = document.querySelector('.Create2ER-StartButton');
button.addEventListener('click', () => {
    console.log('=== CREATE生成開始 ===');
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
        prepareExcelExport(tables, relationships, mermaidCode, '.create-downloadButton', 'createErDiagram');

    } catch (error) {
        console.error(`エラー: ${error.message}`);
        alert(`エラー: ${error.message}`);
    } finally {
        console.log('=== CREATE生成終了 ===');
    }
});

/**
 * ===============================
 * selectER図生成のエントリポイント
 * ===============================
 */
const selectButton = document.querySelector('.Select2ER-StartButton');
selectButton.addEventListener('click', () => {
    console.log('=== SELECT生成開始 ===');
    try {
        // ① クエリ入力値を取得
        const query = document.querySelector('.select-query').value.trim();
        if (!query) {
            alert('クエリを入力してください');
            return;
        }

        document.querySelector('.select-generate-result').classList.add('active');

        // ② クエリの妥当性を検証
        validateQuery(query);
        
        // ③ SELECT文をパース
        const selectInfo = parseSelectQuery(query);
        
        // ④ テーブル情報を抽出（型はすべてstring）
        const tables = extractTablesFromSelect(selectInfo);
        
        // ⑤ JOIN ON条件からリレーションシップを推測
        const tableNames = new Set(tables.map(t => t.name.toLowerCase()));
        const relationships = inferRelationshipsFromJoin(selectInfo.joins, tableNames, selectInfo.aliasMap, selectInfo);
        
        // ⑥ Mermaidコードを生成
        const mermaidCode = generateMermaidDiagram(tables, relationships);
        
        // ⑦ UIに表示 & Mermaidエクスポート準備
        displayDiagram(mermaidCode, 'selectErDiagram');
        prepareExcelExport(tables, relationships, mermaidCode, '.select-downloadButton', 'selectErDiagram');

    } catch (error) {
        console.error(`エラー: ${error.message}`);
        alert(`エラー: ${error.message}`);
    } finally {
        console.log('=== SELECT生成終了 ===');
    }
});

/**
 * ===============================
 * ① クエリ検証（CREATE/SELECT共通）
 * ===============================
 * 入力されたDDLが有効であることを確認
 * - 空でないことを確認
 * - CREATE TABLE文またはSELECT文を含むことを確認
 * 
 * @param {string} query - ユーザーが入力したDDLまたはSELECT
 * @throws {Error} 検証失敗時
 */
function validateQuery(query) {
    if (!query || query.length === 0) {
        throw new Error('クエリが空です');
    }
    if (!/CREATE\s+TABLE|SELECT/i.test(query)) {
        throw new Error('CREATE TABLE文またはSELECT文が見つかりません');
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
 * SELECT文用: クエリパース
 * ===============================
 * SELECT文からFROM句とJOIN句を抽出
 * 複数のJOIN（INNER/LEFT/RIGHT等）に対応
 * 
 * 対応パターン:
 * - 基本: SELECT ... FROM table_name
 * - JOIN: SELECT ... FROM t1 JOIN t2 ON t1.id = t2.id
 * - 複数JOIN: FROM t1 JOIN t2 ON ... JOIN t3 ON ...
 * - サブクエリ: FROM (SELECT ...) t1 JOIN t2 ON ...
 * 
 * 抽出内容:
 * - FROM句のテーブル（メインテーブル）
 * - すべてのJOIN句（テーブル名 + ON条件）
 * 
 * @param {string} query - SELECT文
 * @returns {Object} {fromTable: 'table1', joins: [{table: 'table2', onCondition: 'table1.id = table2.user_id'}, ...]}
 * @throws {Error} FROM句が見つからない場合
 */
function parseSelectQuery(query) {
    // クエリから不要な前後の空白と末尾のセミコロンを削除
    query = query.trim().replace(/;+$/, '');
    
    // エイリアスマッピング: alias => table
    const aliasMap = {};
    
    // ① SELECT句を抽出（括弧を含む複数行SELECT対応）
    // 括弧のバランスを考慮しながらFROMを探す
    const selectMatch = query.match(/SELECT\b/i);
    const selectColumns = [];
    let fromIndex = -1;
    
    if (selectMatch) {
        const selectStart = selectMatch.index + 6;  // "SELECT" の長さ
        let parenCount = 0;
        
        // SELECT の後ろから括弧をカウントしながら FROM を探す
        for (let i = selectStart; i < query.length; i++) {
            if (query[i] === '(') {
                parenCount++;
            } else if (query[i] === ')') {
                parenCount--;
            } else if (parenCount === 0) {
                // 括弧がバランスした状態で FROM キーワードを検索
                const remaining = query.substring(i);
                const fromMatch = remaining.match(/\bFROM\b/i);
                if (fromMatch && fromMatch.index === 0 || (fromMatch.index > 0 && /^\s+FROM\b/i.test(remaining))) {
                    fromIndex = i;
                    break;
                }
            }
        }
        console.log('デバッグ: parseSelectQuery - query="' + query + '"');
        
        // SELECT 句を抽出
        if (fromIndex > selectStart) {
            const selectStr = query.substring(selectStart, fromIndex).trim();
            // カンマで分割して各カラムを処理
            const cols = selectStr.split(',');
            cols.forEach(col => {
                col = col.trim();
                if (col === '*') return;
                
                // AS 別名を抽出
                const asMatch = col.match(/AS\s+(\w+)/i);
                const columnAlias = asMatch ? asMatch[1].toLowerCase() : null;
                
                // テーブル.カラム形式を抽出（括弧内のサブクエリは除外）
                const tableColMatch = col.match(/(\w+)\.(\w+)/);
                
                if (tableColMatch && !col.startsWith('(')) {
                    // テーブル.カラム形式
                    const tableOrAlias = tableColMatch[1].toLowerCase();
                    const columnName = tableColMatch[2].toLowerCase();
                    const displayName = columnAlias || columnName;
                    
                    selectColumns.push({
                        tableOrAlias: tableOrAlias,
                        column: columnName,
                        displayName: displayName,
                        isSubquery: false
                    });
                } else if (col.startsWith('(') && columnAlias) {
                    // サブクエリ（括弧で始まり、AS別名がある）
                    selectColumns.push({
                        tableOrAlias: null,
                        column: columnAlias,
                        displayName: columnAlias,
                        isSubquery: true
                    });
                } else if (columnAlias) {
                    // AS別名がある場合（サブクエリなど）、別名をカラムとして登録
                    selectColumns.push({
                        tableOrAlias: null,
                        column: columnAlias,
                        displayName: columnAlias,
                        isSubquery: false
                    });
                } else if (!col.startsWith('(')) {
                    // テーブル指定なし、AS別名なし
                    selectColumns.push({
                        tableOrAlias: null,
                        column: col.toLowerCase(),
                        displayName: col.toLowerCase(),
                        isSubquery: false
                    });
                }
                //括弧で始まり AS別名がない場合はスキップ
            });
        }
    }
    
    // ② FROM句を抽出（括弧がバランスした状態での最初のFROMを取得）
    // サブクエリ内のFROMではなく、メインクエリのFROMを抽出
    let fromTable = null;
    let fromAlias = null;
    let parenCount = 0;
    
    for (let i = 0; i < query.length; i++) {
        if (query[i] === '(') {
            parenCount++;
        } else if (query[i] === ')') {
            parenCount--;
        } else if (parenCount === 0) {
            // 括弧がバランスした状態でFROMキーワードをチェック
            const remaining = query.substring(i);
            const fromMatch = remaining.match(/\bFROM\s+(\S+)(?:\s+(\S+))?/i);
            if (fromMatch && fromMatch.index === 0) {
                fromTable = fromMatch[1].replace(/[()` ";]/g, '').toLowerCase();  // セミコロンも削除
                fromAlias = fromMatch[2] ? fromMatch[2].replace(/[()` ";]/g, '').toLowerCase() : null;  // セミコロンも削除
                console.log(`デバッグ: parseSelectQuery FROM - fromTable=${fromTable}, fromAlias=${fromAlias}`);
                break;
            }
        }
    }
    
    if (!fromTable) {
        throw new Error('FROM句が見つかりません');
    }
    
    // FROMテーブルとエイリアスのマッピング
    if (fromAlias) {
        aliasMap[fromAlias] = fromTable;
    }
    aliasMap[fromTable] = fromTable; // テーブル名そのものもマッピング

    // JOIN句を抽出（クエリをJOINで分割して処理）
    // 複数のJOINがある場合、各joinを個別に抽出して処理
    const joinSplits = query.split(/\b(?:INNER|LEFT|RIGHT|FULL\s+OUTER)?\s*JOIN\b/i);
    
    // 最初の要素はFROM句までなので、1以降がJOIN句
    const joinParts = [];
    for (let i = 1; i < joinSplits.length; i++) {
        joinParts.push(joinSplits[i]);
    }
    
    console.log('デバッグ: joinParts =', joinParts);

    const joins = [];
    joinParts.forEach((joinPart, partIndex) => {
        console.log(`デバッグ: joinPart[${partIndex}] = "${joinPart}"`);
        
        // 各JOIN部分から「テーブル名 [エイリアス] ON 条件」を抽出
        // ON条件は複数行に対応（AND/ORを含む）
        const joinMatch = joinPart.match(/(\S+)(?:\s+(\S+))?\s+ON\s+([\s\S]+?)$/);
        console.log(`デバッグ: joinPart[${partIndex}] のマッチ結果 =`, joinMatch);
        
        if (joinMatch) {
            const joinTable = joinMatch[1].replace(/[()` ";]/g, '').toLowerCase();  // セミコロンも削除
            const joinAlias = joinMatch[2] ? joinMatch[2].replace(/[()` ";]/g, '').toLowerCase() : null;  // セミコロンも削除
            const onCondition = joinMatch[3].trim().replace(/;+$/, '');  // 末尾の;も削除

            // JOINテーブルとエイリアスのマッピング
            if (joinAlias) {
                aliasMap[joinAlias] = joinTable;
            }
            aliasMap[joinTable] = joinTable;

            joins.push({
                table: joinTable,
                onCondition: onCondition
            });
        }
    });

    return {
        fromTable: fromTable,
        joins: joins,
        aliasMap: aliasMap,
        selectColumns: selectColumns,  // SELECT句から抽出したカラムリスト
        query: query  // サブクエリ解析用にクエリ全体を保存
    };
}

/**
 * ===============================
 * SELECT文用: テーブル情報抽出
 * ===============================
 * SELECT文から抽出したテーブル情報をJSON化
 * SELECT仮想テーブルを中心に、FROM/JOINテーブルを紐づける構造
 * 
 * 抽出内容:
 * - SELECT仮想テーブル（取得対象の集約）
 * - FROM/JOINテーブル（参照先テーブル）
 * - カラム型はすべて'unknown'で統一
 * 
 * @param {Object} selectInfo - parseSelectQuery()の戻り値
 * @returns {Array<Object>} テーブルオブジェクトの配列（SELECT + FROM/JOIN）
 * @example
 * Output: [
 *   {name: 'SELECT', columns: [{name: 'query_result', type: 'unknown', ...}], ...},
 *   {name: 'users', columns: [{name: 'id', type: 'unknown', ...}], ...},
 *   {name: 'orders', columns: [{name: 'id', type: 'unknown', ...}], ...}
 * ]
 */
function extractTablesFromSelect(selectInfo) {
    const tables = [];
    const tableNames = new Set();
    const tableColumnMap = new Map();  // {tableName: Set(columnNames)}
    const aliasMap = selectInfo.aliasMap || {};

    console.log('デバッグ: extractTablesFromSelect の selectInfo =', selectInfo);
    console.log('デバッグ: aliasMap =', aliasMap);

    // ① SELECTテーブルを仮想テーブルとして最初に追加
    // SELECT句から抽出したカラムを使用（{tableOrAlias, column, displayName}の配列）
    const selectColumnsRaw = (selectInfo.selectColumns && selectInfo.selectColumns.length > 0)
        ? selectInfo.selectColumns
        : [{tableOrAlias: null, column: 'query_result', displayName: 'query_result'}];

    // SELECTテーブルのカラムを作成（aliasMapで型を正しく解決）
    const selectTableColumns = selectColumnsRaw.map((col) => {
        // サブクエリかテーブルエイリアスからリアルテーブル名を解決
        let realTableName = 'unknown';
        
        // サブクエリの場合は "SUBQUERY" に設定
        if (col.isSubquery) {
            realTableName = 'SUBQUERY';
        } else if (col.tableOrAlias) {
            // aliasMap に登録されているなら、そこから取得
            if (aliasMap[col.tableOrAlias]) {
                realTableName = aliasMap[col.tableOrAlias];
            } else {
                // aliasMap にないなら、そのまま使用
                realTableName = col.tableOrAlias;
            }
        }
        
        // テーブル名は大文字に（unknown は除外）
        let typeToDisplay = realTableName;
        if (realTableName !== 'unknown') {
            typeToDisplay = realTableName.toUpperCase();
        }
        
        console.log(`デバッグ: SELECTカラム ${col.displayName}: tableOrAlias=${col.tableOrAlias}, isSubquery=${col.isSubquery}, realTableName=${realTableName}, typeToDisplay=${typeToDisplay}`);
        
        return {
            name: col.displayName,
            type: typeToDisplay,  // テーブル名を大文字で設定
            isPrimaryKey: false,
            isForeignKey: false,
            foreignKey: null,
            isNullable: false,
            isAutoIncrement: false
        };
    });

    tables.push({
        name: 'select',
        columns: selectTableColumns,
        primaryKeys: [],
        primaryKey: null,
        foreignKeyConstraints: []
    });

    // ② FROM句のテーブルを追加（PK表示なし）
    if (selectInfo.fromTable) {
        const tableName = selectInfo.fromTable.toLowerCase();
        tableNames.add(tableName);
        if (!tableColumnMap.has(tableName)) {
            tableColumnMap.set(tableName, new Set());
        }
    }

    // ③ JOIN句のテーブルを追加（PK表示なし）
    selectInfo.joins.forEach(join => {
        const tableName = join.table.toLowerCase();
        tableNames.add(tableName);
        if (!tableColumnMap.has(tableName)) {
            tableColumnMap.set(tableName, new Set());
        }
    });

    // ③-1 サブクエリ内のFROM句のテーブルも追加
    if (selectInfo.query) {
        // 括弧内のSELECT...FROMパターンを探す
        const subqueryFromPattern = /\(\s*SELECT[\s\S]*?\s+FROM\s+(\S+)(?:\s+(\S+))?\b/gi;
        let subqueryMatch;
        while ((subqueryMatch = subqueryFromPattern.exec(selectInfo.query)) !== null) {
            const subqueryTable = subqueryMatch[1].replace(/[()` "]/g, '').toLowerCase();
            
            // メインクエリのテーブルと重複していないかチェック
            if (subqueryTable !== selectInfo.fromTable && !selectInfo.joins.some(j => j.table === subqueryTable)) {
                if (!tableNames.has(subqueryTable)) {
                    tableNames.add(subqueryTable);
                    if (!tableColumnMap.has(subqueryTable)) {
                        tableColumnMap.set(subqueryTable, new Set(['id']));
                    }
                }
            }
        }
    }

    // ④ SELECT句から出てくるカラムを、各実テーブルに追加（サブクエリは除外）
    selectColumnsRaw.forEach((col) => {
        // サブクエリカラムは実テーブルに追加しない
        if (col.isSubquery) return;
        
        if (col.tableOrAlias && aliasMap[col.tableOrAlias]) {
            const realTableName = aliasMap[col.tableOrAlias];
            if (tableColumnMap.has(realTableName)) {
                tableColumnMap.get(realTableName).add(col.displayName);
            }
        } else if (col.tableOrAlias && tableColumnMap.has(col.tableOrAlias)) {
            tableColumnMap.get(col.tableOrAlias).add(col.displayName);
        }
    });

    // ④-1 ON条件から参照されているカラムも追加
    if (selectInfo.joins) {
        selectInfo.joins.forEach(join => {
            // ON条件から「テーブル.カラム」パターンを抽出
            const onMatches = join.onCondition.match(/([\w]+)\.([\w]+)/g);
            if (onMatches) {
                onMatches.forEach(match => {
                    const parts = match.match(/([\w]+)\.([\w]+)/);
                    if (parts) {
                        const tableOrAlias = parts[1].toLowerCase();
                        const column = parts[2].toLowerCase();
                        
                        // エイリアスをリアルテーブル名に変換
                        const realTableName = aliasMap[tableOrAlias] || tableOrAlias;
                        
                        // 実テーブルのカラムセットに追加
                        if (tableColumnMap.has(realTableName)) {
                            tableColumnMap.get(realTableName).add(column);
                        }
                    }
                });
            }
        });
    }

    // idカラムも常に追加
    tableColumnMap.forEach((cols) => {
        cols.add('id');
    });

    // ⑤ 実テーブルをMapから作成
    tableColumnMap.forEach((columnSet, tableName) => {
        const columns = Array.from(columnSet).map(colName => ({
            name: colName,
            type: 'unknown',
            isPrimaryKey: false,
            isForeignKey: false,
            foreignKey: null,
            isNullable: false,
            isAutoIncrement: false
        }));
        
        tables.push({
            name: tableName,
            columns: columns,
            primaryKeys: [],
            primaryKey: null,
            foreignKeyConstraints: []
        });
    });

    return tables;
}

/**
 * ===============================
 * SELECT文用: JOIN ON条件から関係推測
 * ===============================
 * SELECT仮想テーブルをハブとして、FROM/JOINテーブルへの関係を作成
 * 
 * 関係構造:
 * - SELECT → FROM テーブル（直接接続）
 * - SELECT → JOIN テーブル1, テーブル2, ... （直接接続）
 * 
 * @param {Array<Object>} joins - parseSelectQuery()で抽出したJOIN配列
 * @param {Set<string>} tableNames - SELECT文に含まれるテーブル名のセット
 * @param {Object} selectInfo - parseSelectQuery()の戻り値（FROM/JOINテーブル情報）
 * @param {Object} aliasMap - エイリアス→テーブル名マッピング
 * @returns {Array<Object>} 推測されたリレーションシップの配列
 * @example
 * Output: [
 *   {fromTable: 'select', fromColumn: 'query_result', toTable: 'users', toColumn: 'id', type: 'from'},
 *   {fromTable: 'select', fromColumn: 'query_result', toTable: 'orders', toColumn: 'id', type: 'join'}
 * ]
 */
function inferRelationshipsFromJoin(joins, tableNames, aliasMap = {}, selectInfo = {}) {
    const relationships = [];

    // ① SELECTテーブルからFROMテーブルへの関係（1:1）
    if (selectInfo.fromTable) {
        relationships.push({
            fromTable: 'select',
            fromColumn: selectInfo.fromTable,
            toTable: selectInfo.fromTable,
            toColumn: selectInfo.fromTable,  // コメントはtoTableのみ
            type: 'select_from'  // SELECT←FROM の1:1関係
        });
    }

    // ② SELECTテーブルから各JOINテーブルへの関係（1:1）
    joins.forEach(join => {
        relationships.push({
            fromTable: 'select',
            fromColumn: join.table,
            toTable: join.table,
            toColumn: join.table,  // コメントはtoTableのみ
            type: 'select_join'  // SELECT←JOIN の1:1関係
        });
    });

    // ③ ON条件からJOIN元テーブル間の関係を抽出（複数条件対応）
    // 例：ON u.id = o.user_id AND o.id = oi.order_id → users||orders, orders||order_items
    console.log('デバッグ: aliasMap =', aliasMap);
    
    joins.forEach((join, joinIndex) => {
        const onCondition = join.onCondition;
        console.log(`デバッグ: JOIN ${joinIndex} の ON条件 = "${onCondition}"`);
        
        // ON条件から全ての「テーブル1.カラム = テーブル2.カラム」パターンを抽出（/g付き）
        const conditionMatches = onCondition.match(/([\w]+)\.([\w]+)\s*=\s*([\w]+)\.([\w]+)/g);
        console.log(`デバッグ: JOIN ${joinIndex} のマッチ結果 =`, conditionMatches);
        
        if (conditionMatches) {
            conditionMatches.forEach((match, matchIndex) => {
                const parts = match.match(/([\w]+)\.([\w]+)\s*=\s*([\w]+)\.([\w]+)/);
                if (parts) {
                    const table1Alias = parts[1].toLowerCase();
                    const col1 = parts[2].toLowerCase();
                    const table2Alias = parts[3].toLowerCase();
                    const col2 = parts[4].toLowerCase();

                    // エイリアスをリアルテーブル名に変換
                    const table1 = aliasMap[table1Alias] || table1Alias;
                    const table2 = aliasMap[table2Alias] || table2Alias;

                    console.log(`デバッグ: 条件 ${matchIndex} = "${match}", マッピング: ${table1Alias}→${table1}, ${table2Alias}→${table2}`);

                    // テーブル間の関係を追加（両方が異なるテーブルである場合）
                    if (table1 !== table2 && table1 !== 'select' && table2 !== 'select') {
                        console.log(`デバッグ: 関係を追加: ${table1} ||--o{ ${table2}`);
                        relationships.push({
                            fromTable: table1,
                            fromColumn: col1,
                            toTable: table2,
                            toColumn: col2,
                            type: 'join_condition'  // JOIN条件からの関係
                        });
                    } else {
                        console.log(`デバッグ: 関係を追加しない (${table1} === ${table2} OR ${table1} === 'select' OR ${table2} === 'select')`);
                    }
                }
            });
        }
    });

    // ④ WHERE条件からもテーブル間の関係を抽出（サブクエリ内など）
    // 例：WHERE o.user_id = u.id → orders ||--o{ users
    if (selectInfo.query) {
        const whereMatch = selectInfo.query.match(/WHERE\s+([\s\S]+?)(?=GROUP|ORDER|LIMIT|;|$)/i);
        if (whereMatch) {
            const whereCondition = whereMatch[1];
            console.log(`デバッグ: WHERE条件 = "${whereCondition}"`);
            
            // WHERE条件から「テーブル.カラム = テーブル.カラム」パターンを抽出
            const whereMatches = whereCondition.match(/([\w]+)\.([\w]+)\s*=\s*([\w]+)\.([\w]+)/g);
            console.log(`デバッグ: WHERE マッチ結果 =`, whereMatches);
            
            if (whereMatches) {
                whereMatches.forEach((match) => {
                    const parts = match.match(/([\w]+)\.([\w]+)\s*=\s*([\w]+)\.([\w]+)/);
                    if (parts) {
                        const table1Alias = parts[1].toLowerCase();
                        const col1 = parts[2].toLowerCase();
                        const table2Alias = parts[3].toLowerCase();
                        const col2 = parts[4].toLowerCase();

                        // エイリアスをリアルテーブル名に変換
                        // aliasMapになければ、テーブル名そのものを使用
                        // tableNamesに含まれていなければスキップ
                        let table1 = aliasMap[table1Alias] || table1Alias;
                        let table2 = aliasMap[table2Alias] || table2Alias;

                        console.log(`デバッグ: WHERE条件 "${match}", マッピング: ${table1Alias}→${table1}, ${table2Alias}→${table2}, tableNames={${Array.from(tableNames).join(', ')}}`);

                        // テーブル名がtableNamesに含まれているかチェック（サブクエリなど含む）
                        const table1Valid = tableNames.has(table1);
                        const table2Valid = tableNames.has(table2);

                        // テーブル間の関係を追加（両方が有効なテーブルで、かつ異なる場合）
                        if (table1 !== table2 && table1 !== 'select' && table2 !== 'select' && 
                            table1Valid && table2Valid) {
                            const relationshipExists = relationships.some(r => 
                                (r.fromTable === table1 && r.toTable === table2) ||
                                (r.fromTable === table2 && r.toTable === table1)
                            );
                            if (!relationshipExists) {
                                console.log(`デバッグ: WHERE関係を追加: ${table1} ||--o{ ${table2}`);
                                relationships.push({
                                    fromTable: table1,
                                    fromColumn: col1,
                                    toTable: table2,
                                    toColumn: col2,
                                    type: 'where_condition'  // WHERE条件からの関係
                                });
                            }
                        } else {
                            console.log(`デバッグ: WHERE関係を追加しない (${table1Valid ? 'table1Valid' : 'table1Invalid'}, ${table2Valid ? 'table2Valid' : 'table2Invalid'})`)
                        }
                    }
                });
            }
        }
    }

    // ⑤ SELECT が参照するすべてのテーブル（サブクエリ含む）への関連線
    // tableNamesに含まれるテーブルのうち、まだ関連線がないものに SELECT との関連線を追加
    tableNames.forEach(tableName => {
        // 既に SELECT ↔ このテーブルの関連線があるかチェック
        const hasRelationship = relationships.some(r => 
            (r.fromTable === 'select' && r.toTable === tableName) ||
            (r.fromTable === tableName && r.toTable === 'select')
        );
        
        // 関連線がなければ、SELECT <- サブクエリテーブル の関連線を追加
        if (!hasRelationship && tableName !== selectInfo.fromTable && 
            !joins.some(j => j.table === tableName)) {
            console.log(`デバッグ: SELECT ↔ サブクエリテーブル関連線を追加: select ||--|| ${tableName}`);
            relationships.push({
                fromTable: 'select',
                fromColumn: tableName,
                toTable: tableName,
                toColumn: tableName,
                type: 'select_from'  // SELECT ← サブクエリテーブル
            });
        }
    });

    return relationships;
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
            // typeMapにない型（テーブル名など）は元の型をそのまま使用
            const baseType = column.type.toLowerCase().split('(')[0].trim();
            const typeStr = typeMap[baseType] || column.type;  // テーブル名は大文字を保持
            
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
            
            // 関係タイプに応じて異なる線を描画
            if (rel.type === 'select_from' || rel.type === 'select_join') {
                // SELECT ↔ 実テーブル： 1:1の関係（||--||）
                // コメントはtoTableのみ
                mermaidCode += `    ${fromTableUpper} ||--|| ${toTableUpper} : ""\n`;
            } else if (rel.type === 'join_condition') {
                // JOIN条件からの実テーブル間の関係：1対多（||--o{）
                mermaidCode += `    ${fromTableUpper} ||--o{ ${toTableUpper} : "${fromTableUpper}.${rel.fromColumn} = ${toTableUpper}.${rel.toColumn}"\n`;
            } else if (rel.type === 'where_condition') {
                // WHERE条件からの実テーブル間の関係：1対多（||--o{）
                mermaidCode += `    ${fromTableUpper} ||--o{ ${toTableUpper} : "${fromTableUpper}.${rel.fromColumn} = ${toTableUpper}.${rel.toColumn} (WHERE)"\n`;
            } else if (rel.type === 'foreign_key' || rel.type === 'inferred') {
                // CREATE文モードでの通常の外部キー関係
                mermaidCode += `    ${fromTableUpper} ||--o{ ${toTableUpper} : "${fromTableUpper}.${rel.fromColumn}"\n`;
            }
        }
    });

    console.log('生成されたMermaidコード:');
    console.log(mermaidCode);
    
    return mermaidCode;
}

/**
 * ===============================
 * ⑥ ER図表示（CREATE/SELECT共通）
 * ===============================
 * 生成したMermaidコードをHTMLに挿入
 * Mermaid.jsライブラリがあれば自動的にレンダリング
 * 
 * @param {string} mermaidDiagram - Mermaid形式のER図定義コード
 * @param {string} elementId - 出力先要素のID (デフォルト: 'createErDiagram')
 */
function displayDiagram(mermaidDiagram, elementId = 'createErDiagram') {
    const outputArea = document.querySelector(`#${elementId}`);
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
 * ⑦-1 Mermaidエクスポート準備（CREATE/SELECT共通）
 * ===============================
 * Mermaidコード、テーブル情報をグローバルに保存
 * ダウンロードボタンのクリックハンドラを設定
 * 
 * 保存される情報:
 * - mermaidCode: 生成されたMermaidのER図コード
 * - tables: テーブル定義と全カラン情報
 * - relationships: テーブル間の関係
 * - generatedAt: ER図生成日時
 * - diagramElementId: ER図のHTML要素ID
 * 
 * @param {Array<Object>} tables - テーブル情報
 * @param {Array<Object>} relationships - リレーションシップ情報
 * @param {string} mermaidCode - 生成されたMermaidコード
 * @param {string} downloadBtnSelector - ダウンロードボタンのセレクタ (デフォルト: '.create-downloadButton')
 * @param {string} diagramElementId - ER図要素のID (デフォルト: 'createErDiagram')
 */
function prepareExcelExport(tables, relationships, mermaidCode, downloadBtnSelector = '.create-downloadButton', diagramElementId = 'createErDiagram') {
    // グローバルオブジェクトにデータを保存
    window.exportData = {
        mermaidCode: mermaidCode,
        tables: tables,
        relationships: relationships,
        generatedAt: new Date().toLocaleString('ja-JP'),
        diagramElementId: diagramElementId
    };

    // ダウンロードボタンを有効化
    const downloadBtn = document.querySelector(downloadBtnSelector);
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
        const diagramElementId = window.exportData.diagramElementId || 'createErDiagram';
        
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
            const erDiagramDiv = document.querySelector(`#${diagramElementId}`);
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
