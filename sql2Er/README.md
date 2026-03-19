# SQL2ER - SQL DDL to ER Diagram Generator

**SQLからER図を自動生成するツール**

[English](#english) | [日本語](#日本語)

---

## English

### Overview

SQL2ER is a web-based tool that automatically generates Entity-Relationship (ER) diagrams from SQL CREATE TABLE statements. Simply paste your DDL, and visualize your database schema instantly.

### Features

- ✅ **Real-time Generation** - ER diagrams appear instantly as you enter DDL
- ✅ **Multiple Tables** - Process multiple CREATE TABLE statements at once
- ✅ **Composite Keys** - Support for `PRIMARY KEY (col1, col2)`
- ✅ **Composite Foreign Keys** - Multi-column foreign key references
- ✅ **Inline & Constraint Forms** - Recognizes both `INT PRIMARY KEY` and `PRIMARY KEY (col)` syntax
- ✅ **FK Inference** - Automatically detects relationships from naming conventions (user_id → users)
- ✅ **Plural Form Support** - Auto-recognizes user/users, category/categories, etc.
- ✅ **Multiple Export Formats** - Download as Mermaid (.mmd) or PNG image

### Target Users

- 📚 **Database Design Beginners** - Learn schemas visually
- 🏗️ **Schema Design Phase** - Verify design during planning
- 📋 **Documentation** - Embed ER diagrams in reports
- 🔄 **Schema Review** - Validate table designs

### Features

#### 1. DDL Parsing
- Automatic CREATE TABLE statement extraction
- Table names, column names, data types
- PRIMARY KEY detection (single and composite)
- FOREIGN KEY constraint analysis

#### 2. Relationship Inference (2-Level Algorithm)
- **Priority 1**: Extract explicit relationships from FOREIGN KEY constraints
- **Priority 2**: Infer relationships from column naming conventions
  - `user_id` → references users table's id column
  - `userId` → references users table's id column
  - `user_code` → references users table's id column

#### 3. ER Diagram Generation
- Rendered using Mermaid.js
- Visual representation of Primary Keys (PK) and Foreign Keys (FK)
- Relationship arrows between entities

#### 4. File Export
- **Mermaid format (.mmd)** - Text format for portability
- **PNG image (.png)** - Screenshot format for documentation

### Getting Started

#### Step 1: Enter SQL
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL
);

CREATE TABLE orders (
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    total DECIMAL(10,2),
    PRIMARY KEY (order_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Step 2: Click "Generate"
- ER diagram appears in your browser

#### Step 3: Download
- Download both `.mmd` and `.png` files

### Supported Syntax

#### Supported Data Types
```
- VARCHAR(n), CHAR(n), TEXT
- INT, BIGINT, SMALLINT, TINYINT
- DECIMAL(m,n), FLOAT, DOUBLE
- DATE, DATETIME, TIMESTAMP
- BOOLEAN, ENUM, etc.
```

#### Supported DDL Patterns

**Primary Key Definition:**
```sql
-- Inline form
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ...
);

-- Constraint form
CREATE TABLE orders (
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    PRIMARY KEY (order_id, tenant_id),
    ...
);
```

**Foreign Key Definition:**
```sql
-- Simple foreign key
FOREIGN KEY (user_id) REFERENCES users(id)

-- Composite foreign key
FOREIGN KEY (order_id, tenant_id) REFERENCES orders(order_id, tenant_id)
```

**Column Attributes:**
```sql
...
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(255) NOT NULL
email VARCHAR(255) UNIQUE
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
...
```

### Output Formats

#### Mermaid Format (.mmd)
```
erDiagram
    USERS {
        int id PK
        varchar username
        varchar email
    }
    ORDERS {
        int order_id PK
        int tenant_id PK
        int user_id FK
        decimal total_amount
    }
    USERS ||--o{ ORDERS : "..."
```

#### PNG Image (.png)
- Screenshot of the ER diagram
- Ready to embed in documentation

### Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **ER Diagram Rendering**: Mermaid.js v11.13.0
- **Image Conversion**: html2canvas
- **UI Framework**: Bootstrap 5.3.8

### FAQ

**Q: Can I process multiple DDLs at once?**
A: Yes. Separate multiple CREATE TABLE statements with semicolons (;).

**Q: Can I extract DDL from an existing database?**
A: This tool works with text input. Export your schema from your database tool (MySQL Workbench, etc.) and paste it here.

**Q: Can I edit the generated ER diagram?**
A: Yes. The .mmd file is plain text and can be edited in Mermaid-compatible editors (vscode-mermaid, etc.).

**Q: How can I adjust PNG quality?**
A: Modify the `scale` parameter in the `html2canvas()` call in script.js.

### Limitations

- Index information is not displayed
- Stored procedures and functions are not processed
- Special data types are handled generically

### License

MIT License

---

## 日本語

### 概要

SQL の CREATE TABLE 文を貼り付けるだけで、自動的にER（Entity-Relationship）図を生成するWebツールです。データベーススキーマを視覚的に理解できます。

### 特徴

- ✅ **リアルタイム生成** - DDL を入力すると即座にER図を表示
- ✅ **複数テーブル対応** - 複数の CREATE TABLE 文を一括処理
- ✅ **複合主キー対応** - `PRIMARY KEY (col1, col2)` に対応
- ✅ **複合外部キー対応** - 複数カラムを参照する外部キーも認識
- ✅ **インライン・制約形式対応** - `INT PRIMARY KEY` と `PRIMARY KEY (col)` の両方に対応
- ✅ **FK推測機能** - 明示的なFOREIGN KEYがなくても、命名規則（user_id → users など）から関係を推測
- ✅ **複数形対応** - user/users、category/categories などを自動認識
- ✅ **複数形式でダウンロード** - Mermaid形式（.mmd）と画像形式（.png）で出力可能

### ターゲット

- 📚 **DB設計初学者** - スキーマを視覚的に学べます
- 🏗️ **DB設計フェーズ** - 設計段階でスキーマを確認
- 📋 **ドキュメント作成** - ER図を資料に貼り付け可能
- 🔄 **スキーマレビュー** - テーブル設計の妥当性を判定

### 機能

#### 1. DDL解析
- CREATE TABLE ステートメントを自動抽出
- テーブル名、カラン名、データ型を解析
- PRIMARY KEY（単一・複合）を検出
- FOREIGN KEY 制約を解析

#### 2. 関係推測（2段階アルゴリズム）
- **優先1**: FOREIGN KEY 制約から明示的な関係を抽出
- **優先2**: カラン命名規則から関係を推測
  - `user_id` → users テーブルの id カラムへの参照
  - `userId` → users テーブルの id カラムへの参照
  - `user_code` → users テーブルの id カラムへの参照

#### 3. ER図生成
- Mermaid.js で ER 図を レンダリング
- 主キー（PK）と外部キー（FK）を視覚的に表示
- 複数のエンティティ間の関係を矢印で表示

#### 4. ファイルエクスポート
- **Mermaid形式（.mmd）** - テキスト形式でダウンロード可能
- **PNG画像（.png）** - ER図のスクリーンショット形式

### 使い方

#### ステップ1: SQL入力
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL
);

CREATE TABLE orders (
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    total DECIMAL(10,2),
    PRIMARY KEY (order_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### ステップ2: 「生成」ボタンをクリック
- ER図がブラウザに表示されます

#### ステップ3: ダウンロード
- 「ダウンロード」ボタンで `.mmd` と `.png` を取得

### 対応する構文

#### 対応データ型
```
- VARCHAR(n), CHAR(n), TEXT
- INT, BIGINT, SMALLINT, TINYINT
- DECIMAL(m,n), FLOAT, DOUBLE
- DATE, DATETIME, TIMESTAMP
- BOOLEAN, ENUM など
```

#### 対応する DDL パターン

**主キー定義:**
```sql
-- インライン形式
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ...
);

-- 制約形式
CREATE TABLE orders (
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    PRIMARY KEY (order_id, tenant_id),
    ...
);
```

**外部キー定義:**
```sql
-- 単純な外部キー
FOREIGN KEY (user_id) REFERENCES users(id)

-- 複合外部キー
FOREIGN KEY (order_id, tenant_id) REFERENCES orders(order_id, tenant_id)
```

**カラン属性:**
```sql
...
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(255) NOT NULL
email VARCHAR(255) UNIQUE
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
...
```

### 出力形式

#### Mermaid形式（.mmd）
```
erDiagram
    USERS {
        int id PK
        varchar username
        varchar email
    }
    ORDERS {
        int order_id PK
        int tenant_id PK
        int user_id FK
        decimal total_amount
    }
    USERS ||--o{ ORDERS : "..."
```

#### PNG画像（.png）
- ER図のスクリーンショット
- 資料に直接貼り付け可能

### 技術スタック

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **ER図レンダリング**: Mermaid.js v11.13.0
- **画像変換**: html2canvas
- **UI フレームワーク**: Bootstrap 5.3.8

### よくある質問（FAQ）

**Q: 複数のDDLを一度に処理できますか？**
A: はい。複数の CREATE TABLE 文をセミコロン（;）で区切って入力してください。

**Q: 既存データベースから DDL を抽出できますか？**
A: このツールはテキストベースです。データベース管理ツール（MySQL Workbench など）で DDL をエクスポートして、ここに貼り付けてください。

**Q: 生成したER図を編集できますか？**
A: .mmd ファイルはテキストです。Mermaid対応エディタ（vscode-mermaid など）で編集可能です。

**Q: PNG の品質を調整できますか？**
A: script.js の `html2canvas()` 呼び出しで `scale` パラメータを調整してください。

### 制限事項

- インデックス情報は表示されません
- ストアドプロシージャや関数は処理対象外です
- 特殊なデータ型や バリアント型は簡易的に処理されます

### ライセンス

MIT License