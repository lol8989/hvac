// 장비마스터 SQLite 스키마 (schema_v2.sql PostgreSQL 설계의 POC 서브셋 이식).
// 4단 분류(category→subcategory→series→products) + 정규화 hot 필드 + product_specs(JSON) + 단가 + 게시게이트.
// PG→SQLite 이식: BIGSERIAL→INTEGER PK, TIMESTAMPTZ/DATE→TEXT, JSONB→TEXT, BOOLEAN→INTEGER, NUMERIC→REAL/INTEGER.
//
// 스키마 구조 버전 — IndexedDB 캐시 무효화 키의 일부(DDL 구조 또는 시드 '적재 규칙' 변경 시 증가).
// 시드 '값' 변경은 별도로 seedData.ts의 SEED_HASH(내용 해시)가 자동 무효화하므로 여기 손댈 필요 없음.
// v2: 시드 제품에 created_at/updated_at/published_at 스탬프 추가(등록·수정·게시일 컬럼 표기).
export const SCHEMA_VERSION = 2

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE product_categories (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name_ko    TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_subcategories (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES product_categories(id),
  code          TEXT NOT NULL UNIQUE,
  name_ko       TEXT NOT NULL,           -- 실내기 유형(4WAY 카세트/덕트) · 실외기 계통(냉난방 절환형/냉방전용/GHP)
  energy_source TEXT                      -- 계열: EHP/GHP/AWHP...
);

CREATE TABLE product_series (
  id             INTEGER PRIMARY KEY,
  subcategory_id INTEGER NOT NULL REFERENCES product_subcategories(id),
  code           TEXT NOT NULL UNIQUE,
  name_ko        TEXT NOT NULL,
  mfl_code       TEXT
);

CREATE TABLE efficiency_grades (
  id   INTEGER PRIMARY KEY,               -- 1~5
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id                       INTEGER PRIMARY KEY,
  series_id                INTEGER NOT NULL REFERENCES product_series(id),
  model_code               TEXT NOT NULL UNIQUE,      -- 모델명 (RNW0401C2S)
  equipment_code           TEXT,                      -- 장비번호 단축코드 (실내기 '40C')
  name_display             TEXT,
  horsepower               REAL,                      -- 마력(HP)
  cooling_capacity_w       INTEGER,                   -- 정격냉방능력(W)
  heating_capacity_w       INTEGER,                   -- 정격난방능력(W). NULL=냉방전용
  heating_capacity_cold_w  INTEGER,                   -- 난방 한랭지(-15℃)
  cop_cooling              REAL,
  cop_heating              REAL,
  efficiency_grade_id      INTEGER REFERENCES efficiency_grades(id),
  max_connections          INTEGER,                   -- 실외기 최대 연결 실내기 수
  status                   TEXT NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at             TEXT,
  discontinued_at          TEXT,
  created_at               TEXT,
  updated_at               TEXT
);

CREATE TABLE product_specs (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id),
  spec_data  TEXT NOT NULL DEFAULT '{}'  -- JSONB 롱테일(제품군 고유 항목: 송풍기·배관·전선·차단기 등)
);

CREATE TABLE price_types (
  id       INTEGER PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,
  name_ko  TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_prices (
  id                   INTEGER PRIMARY KEY,
  product_id           INTEGER NOT NULL REFERENCES products(id),
  price_type_id        INTEGER NOT NULL REFERENCES price_types(id),
  price_krw            INTEGER NOT NULL,
  price_with_vat_krw   INTEGER,
  effective_start_date TEXT NOT NULL,
  effective_end_date   TEXT,             -- NULL = 현행가
  source_reference     TEXT,
  priority             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_products_status        ON products(status);
CREATE INDEX idx_products_series        ON products(series_id);
CREATE INDEX idx_product_prices_current ON product_prices(product_id, price_type_id);

-- 게시(PUBLISHED) 제품 + 분류·계열 평탄화 뷰 (v_published_products 상당).
CREATE VIEW v_published_products AS
  SELECT
    p.*,
    sc.name_ko       AS subcategory_name,
    sc.energy_source AS energy_source,
    c.code           AS category_code
  FROM products p
  JOIN product_series s        ON p.series_id = s.id
  JOIN product_subcategories sc ON s.subcategory_id = sc.id
  JOIN product_categories c     ON sc.category_id = c.id
  WHERE p.status = 'PUBLISHED';
`
