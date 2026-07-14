-- 도면검도시스템 v3 — 장비 마스터 DB (프로덕션)
-- PostgreSQL 15+ DDL Script
-- 작성일: 2026-07-13
--
-- v2(2026-05-22) 대비 변경 — 근거: doc/02_DB설계/04_sqlite_to_pg_migration.md
--   [+] product_series.is_vrf              계열의 VRF 여부(게시 요건·HP 인코딩·조합 후보를 함께 가르는 축)
--   [+] products.equipment_code            장비번호 단축코드(장비일람표 컬럼)
--   [+] products.hp_source                 마력 출처(환산식은 산출식이 아니라 검증·백필식)
--   [+] products.max_connections           실외기 최대 연결 실내기 '대수'
--   [+] products.combo_min / combo_max     조합비 허용범위 모델별 override
--   [-] products.power_consumption_cool_w / power_consumption_heat_w
--   [-] products.weight_kg / dim_width_mm / dim_height_mm / dim_depth_mm
--       → 롱테일이므로 product_specs(JSONB)로 내린다. 제거 근거(주인님 확정 2026-07-13):
--         ① 채움률 과반 미만(소비전력 냉방 46.5% · 난방 38.1%, 1,206모델 전수 기준)
--         ② 값이 스칼라가 아니다 — 실내기 소비전력 '11 / - / -'(강/중/약), 치수 '860 x 132 x 450'(결합 문자열)
--         ③ 쿼리 조건으로 쓰이지 않는다 — 조합·선정 판단은 용량/HP/maxConn/조합비/계열이 전담하고,
--            실외기 이격거리 검증조차 모델별 치수가 아니라 상수(ODU_BODY_W_MM/D_MM)를 쓴다
--         ④ 조회 경로가 이미 있다 — 라벨 변종을 흡수하는 SpecLookup이 JSONB에서 읽는다
--       필요해지면 정규화하지 말고 JSONB 표현식 인덱스로 대응한다(§7-1 주석 참조).
--   [=] 단가(product_prices·price_types·price_change_logs) 구조 유지, 데이터 이관 대상 아님.
--       스펙시트에 단가가 없다(주인님 확정 2026-07-13). 우선순위는 price_types.priority에만 둔다.
-- ============================================================================

SET client_encoding = 'UTF8';

-- ============================================================================
-- 1. 마스터(Lookup)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refrigerant_types (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(50)  NOT NULL,
    gwp         INTEGER,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_types (
    id                BIGSERIAL PRIMARY KEY,
    code              VARCHAR(20)   NOT NULL UNIQUE,
    name_ko           VARCHAR(50)   NOT NULL,
    pressure_min_kpa  NUMERIC(8,2),
    pressure_max_kpa  NUMERIC(8,2),
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS power_supplies (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(40) NOT NULL UNIQUE,
    phase         SMALLINT    NOT NULL CHECK (phase IN (1, 3)),
    wire          SMALLINT    NOT NULL,
    voltage_v     INTEGER     NOT NULL,
    frequency_hz  INTEGER     NOT NULL,
    display       VARCHAR(60) NOT NULL,
    UNIQUE (phase, wire, voltage_v, frequency_hz)
);

CREATE TABLE IF NOT EXISTS compressor_types (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(40) NOT NULL UNIQUE,
    type            VARCHAR(40) NOT NULL,
    qty_per_unit    SMALLINT    DEFAULT 1,
    oil_capacity_l  NUMERIC(6,2),
    oil_model       VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS fan_types (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40) NOT NULL UNIQUE,
    type        VARCHAR(40) NOT NULL,
    motor_type  VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS efficiency_grades (
    id     SMALLINT     PRIMARY KEY,
    name   VARCHAR(20)  NOT NULL UNIQUE
);

-- 계열(EHP/GHP/AWHP/수냉식...). 호환 판단의 기준이라 오타로 새 값이 생기면 안 된다 → 룩업 테이블.
CREATE TABLE IF NOT EXISTS energy_sources (
    id       BIGSERIAL PRIMARY KEY,
    code     VARCHAR(20) NOT NULL UNIQUE,
    name_ko  VARCHAR(40) NOT NULL
);

-- ============================================================================
-- 2. 사용자/감사
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
    id       SMALLSERIAL PRIMARY KEY,
    code     VARCHAR(30) NOT NULL UNIQUE,
    name_ko  VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(120) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(60)  NOT NULL,
    user_role_id    SMALLINT     NOT NULL REFERENCES user_roles(id),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_role ON users(user_role_id);

CREATE TABLE IF NOT EXISTS file_uploads (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users(id),
    file_path         VARCHAR(500) NOT NULL,
    file_name         VARCHAR(255) NOT NULL,
    file_size_bytes   BIGINT       NOT NULL,
    file_hash         CHAR(64)     UNIQUE,
    mime_type         VARCHAR(80),
    category          VARCHAR(40),
    uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_file_uploads_user     ON file_uploads(user_id);
CREATE INDEX idx_file_uploads_category ON file_uploads(category);
CREATE INDEX idx_file_uploads_time     ON file_uploads(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
    id                   BIGSERIAL PRIMARY KEY,
    key_prefix           CHAR(8)       NOT NULL UNIQUE,
    key_hash             CHAR(64)      NOT NULL UNIQUE,
    name                 VARCHAR(120)  NOT NULL,
    owner_user_id        BIGINT        NOT NULL REFERENCES users(id),
    scopes               VARCHAR(255)  NOT NULL DEFAULT 'read:products',
    rate_limit_per_min   INTEGER       NOT NULL DEFAULT 60,
    ip_whitelist         INET[],
    expires_at           TIMESTAMPTZ,
    revoked_at           TIMESTAMPTZ,
    last_used_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_api_keys_lifetime CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX idx_api_keys_owner    ON api_keys(owner_user_id);
CREATE INDEX idx_api_keys_expires  ON api_keys(expires_at);
CREATE INDEX idx_api_keys_revoked  ON api_keys(revoked_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       REFERENCES users(id),
    api_key_id  BIGINT       REFERENCES api_keys(id),
    table_name  VARCHAR(60)  NOT NULL,
    record_id   BIGINT       NOT NULL,
    action      VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    before      JSONB,
    after       JSONB,
    ip          INET,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_apikey ON audit_logs(api_key_id);
CREATE INDEX idx_audit_logs_time   ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS api_access_logs (
    id                    BIGSERIAL PRIMARY KEY,
    api_key_id            BIGINT       REFERENCES api_keys(id),
    endpoint              VARCHAR(255) NOT NULL,
    method                VARCHAR(10)  NOT NULL,
    status_code           SMALLINT     NOT NULL,
    latency_ms            INTEGER,
    response_size_bytes   INTEGER,
    client_ip             INET,
    user_agent            VARCHAR(255),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_api_access_apikey ON api_access_logs(api_key_id);
CREATE INDEX idx_api_access_status ON api_access_logs(status_code);
CREATE INDEX idx_api_access_path   ON api_access_logs(endpoint);
CREATE INDEX idx_api_access_time   ON api_access_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
    id           BIGSERIAL PRIMARY KEY,
    key          VARCHAR(80) NOT NULL UNIQUE,
    value        TEXT        NOT NULL,
    value_type   VARCHAR(20) NOT NULL DEFAULT 'string'
                 CHECK (value_type IN ('string','number','boolean','json')),
    description  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by   BIGINT      REFERENCES users(id)
);

-- ============================================================================
-- 3. 제품 카탈로그
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40) NOT NULL UNIQUE,
    name_ko     VARCHAR(60) NOT NULL,
    sort_order  INTEGER     DEFAULT 0,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_subcategories (
    id                   BIGSERIAL PRIMARY KEY,
    product_category_id  BIGINT       NOT NULL REFERENCES product_categories(id),
    code                 VARCHAR(60)  NOT NULL UNIQUE,
    name_ko              VARCHAR(120) NOT NULL,
    energy_source_id     BIGINT       REFERENCES energy_sources(id)
);
CREATE INDEX idx_product_subcategories_cat ON product_subcategories(product_category_id);

CREATE TABLE IF NOT EXISTS product_series (
    id                       BIGSERIAL PRIMARY KEY,
    product_subcategory_id   BIGINT       NOT NULL REFERENCES product_subcategories(id),
    code                     VARCHAR(60)  NOT NULL UNIQUE,
    name_ko                  VARCHAR(120) NOT NULL,
    mfl_code                 VARCHAR(30),
    release_year             INTEGER,
    -- [v3 신규] VRF(실외기 1대 ↔ 실내기 N대) 계열 여부.
    -- 이 한 축이 세 가지를 함께 가른다:
    --   ① 모델명이 마력(HP)을 인코딩하는가
    --   ② 게시(PUBLISHED)에 최대 연결 실내기 대수를 요구하는가
    --   ③ 생성단 실외기 조합 후보로 노출되는가
    -- 실데이터에서 세 성질이 정확히 일치한다(칠러·CDU·단품은 모두 false).
    -- 근거: doc/05_설계결정/마력_환산식_적용_검토.md §5
    is_vrf                   BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_product_series_subcat ON product_series(product_subcategory_id);
CREATE INDEX idx_product_series_mfl    ON product_series(mfl_code);
CREATE INDEX idx_product_series_vrf    ON product_series(is_vrf);

CREATE TABLE IF NOT EXISTS products (
    id                          BIGSERIAL PRIMARY KEY,
    product_series_id           BIGINT       NOT NULL REFERENCES product_series(id),
    model_code                  VARCHAR(60)  NOT NULL UNIQUE,
    -- [v3 신규] 장비번호 단축코드(실내기 '40C' 등). 장비일람표 컬럼.
    equipment_code              VARCHAR(20),
    name_display                VARCHAR(160),
    refrigerant_type_id         BIGINT       REFERENCES refrigerant_types(id),
    power_supply_id             BIGINT       REFERENCES power_supplies(id),
    efficiency_grade_id         SMALLINT     REFERENCES efficiency_grades(id),
    horsepower                  NUMERIC(5,2),
    -- [v3 신규] 마력 출처. 용량→마력 환산식은 산출식이 아니라 검증·백필식이므로 출처를 남긴다.
    --   MODEL_CODE = 모델명 인코딩(VRF만) / DERIVED = 용량 환산 추정 / CURATED = 큐레이션 / MANUAL = 수기
    hp_source                   VARCHAR(20)
                                CHECK (hp_source IS NULL OR hp_source IN ('MODEL_CODE','DERIVED','CURATED','MANUAL')),
    cooling_capacity_w          INTEGER,
    heating_capacity_w          INTEGER,     -- NULL = 냉방전용. 계열만으로는 냉난방을 못 가른다.
    heating_capacity_cold_w     INTEGER,     -- 한랭지(-15℃)
    cop_cooling                 NUMERIC(4,2),
    cop_heating                 NUMERIC(4,2),
    -- [v3 신규] 실외기에 붙일 수 있는 실내기 '대수' 상한 (실 개수가 아니다).
    max_connections             SMALLINT     CHECK (max_connections IS NULL OR max_connections > 0),
    -- [v3 신규] 조합비 허용범위 모델별 override. NULL이면 system_settings의 전역 기본을 따른다.
    -- 조합비 = Σ(연결 실내기 정격 냉방용량) ÷ 실외기 용량.
    combo_min                   NUMERIC(4,2),
    combo_max                   NUMERIC(4,2),
    manufacturer                VARCHAR(60)  DEFAULT 'LG전자',
    status                      VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    published_at                TIMESTAMPTZ,
    discontinued_at             DATE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                  BIGINT       REFERENCES users(id),
    updated_by                  BIGINT       REFERENCES users(id),
    CONSTRAINT chk_products_combo_range
        CHECK (combo_min IS NULL OR combo_max IS NULL OR combo_min <= combo_max)
);
CREATE INDEX idx_products_series       ON products(product_series_id);
CREATE INDEX idx_products_refrigerant  ON products(refrigerant_type_id);
CREATE INDEX idx_products_hp           ON products(horsepower);
CREATE INDEX idx_products_cool_w       ON products(cooling_capacity_w);
CREATE INDEX idx_products_heat_w       ON products(heating_capacity_w);
CREATE INDEX idx_products_status       ON products(status);
CREATE INDEX idx_products_published    ON products(published_at DESC);
CREATE INDEX idx_products_equip_code   ON products(equipment_code);
CREATE INDEX idx_products_active       ON products(id) WHERE status = 'PUBLISHED' AND discontinued_at IS NULL;

-- 롱테일 스펙(전원·배관경·전선·차단기·냉매·소음·중량·치수·소비전력…).
-- 정규화하지 않는 이유는 파일 상단 [-] 항목 참조. 라벨 변종은 조회 계층(SpecLookup)이 흡수한다.
CREATE TABLE IF NOT EXISTS product_specs (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT       NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    spec_data       JSONB        NOT NULL DEFAULT '{}',
    source_file_id  BIGINT       REFERENCES file_uploads(id),
    imported_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_product_specs_data ON product_specs USING GIN (spec_data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS product_panels (
    id                BIGSERIAL PRIMARY KEY,
    indoor_product_id BIGINT  NOT NULL REFERENCES products(id),
    panel_product_id  BIGINT  NOT NULL REFERENCES products(id),
    is_default        BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (indoor_product_id, panel_product_id)
);
CREATE INDEX idx_product_panels_indoor ON product_panels(indoor_product_id);
CREATE INDEX idx_product_panels_panel  ON product_panels(panel_product_id);

CREATE TABLE IF NOT EXISTS product_combinations (
    id                   BIGSERIAL PRIMARY KEY,
    product_id           BIGINT   NOT NULL REFERENCES products(id),
    component_product_id BIGINT   NOT NULL REFERENCES products(id),
    quantity             SMALLINT NOT NULL DEFAULT 1,
    sequence             SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX idx_product_combinations_product   ON product_combinations(product_id);
CREATE INDEX idx_product_combinations_component ON product_combinations(component_product_id);

CREATE TABLE IF NOT EXISTS indoor_outdoor_compat (
    id                  BIGSERIAL PRIMARY KEY,
    indoor_product_id   BIGINT NOT NULL REFERENCES products(id),
    outdoor_product_id  BIGINT NOT NULL REFERENCES products(id),
    compatibility_note  TEXT,
    UNIQUE (indoor_product_id, outdoor_product_id)
);
CREATE INDEX idx_io_compat_indoor  ON indoor_outdoor_compat(indoor_product_id);
CREATE INDEX idx_io_compat_outdoor ON indoor_outdoor_compat(outdoor_product_id);

CREATE TABLE IF NOT EXISTS spec_documents (
    id                BIGSERIAL PRIMARY KEY,
    product_series_id BIGINT       NOT NULL REFERENCES product_series(id),
    mfl_code          VARCHAR(30)  NOT NULL UNIQUE,
    doc_version       VARCHAR(40),
    doc_date          DATE,
    file_upload_id    BIGINT       NOT NULL REFERENCES file_uploads(id),
    uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_spec_documents_series ON spec_documents(product_series_id);
CREATE INDEX idx_spec_documents_date   ON spec_documents(doc_date);

CREATE TABLE IF NOT EXISTS product_tags (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(40) NOT NULL UNIQUE,
    name_ko    VARCHAR(40) NOT NULL,
    color_hex  CHAR(7)     DEFAULT '#888888',
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_tag_assignments (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_tag_id  BIGINT       NOT NULL REFERENCES product_tags(id),
    assigned_by     BIGINT       REFERENCES users(id),
    assigned_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, product_tag_id)
);
CREATE INDEX idx_tag_assign_product ON product_tag_assignments(product_id);
CREATE INDEX idx_tag_assign_tag     ON product_tag_assignments(product_tag_id);

-- ============================================================================
-- 4. 가격
--    ⚠️ 스펙시트에 단가가 없다(주인님 확정 2026-07-13). 구조는 두되 초기 이관 데이터는 없다.
--    우선순위 축은 price_types.priority(가격 유형별) 하나뿐이다 — 가격 레코드별 priority는 두지 않는다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_types (
    id        SMALLSERIAL PRIMARY KEY,
    code      VARCHAR(30) NOT NULL UNIQUE,
    name_ko   VARCHAR(40) NOT NULL,
    priority  SMALLINT    DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_prices (
    id                     BIGSERIAL PRIMARY KEY,
    product_id             BIGINT         NOT NULL REFERENCES products(id),
    price_type_id          SMALLINT       NOT NULL REFERENCES price_types(id),
    price_krw              NUMERIC(14,0)  NOT NULL,
    price_with_vat_krw     NUMERIC(14,0),
    effective_start_date   DATE           NOT NULL,
    effective_end_date     DATE,                      -- NULL = 현행가
    source_reference       VARCHAR(120),
    source_file_id         BIGINT         REFERENCES file_uploads(id),
    created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_price_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);
CREATE INDEX idx_product_prices_lookup  ON product_prices(product_id, price_type_id, effective_start_date DESC);
CREATE INDEX idx_product_prices_current ON product_prices(product_id, price_type_id) WHERE effective_end_date IS NULL;

CREATE TABLE IF NOT EXISTS price_change_logs (
    id                   BIGSERIAL PRIMARY KEY,
    effective_date       DATE         NOT NULL,
    change_summary       VARCHAR(200) NOT NULL,
    change_description   TEXT,
    source_file_id       BIGINT       REFERENCES file_uploads(id)
);
CREATE INDEX idx_price_change_date ON price_change_logs(effective_date DESC);

-- ============================================================================
-- 5. ETL 작업 관리
-- ============================================================================

CREATE TABLE IF NOT EXISTS spec_label_aliases (
    id              BIGSERIAL PRIMARY KEY,
    source_pattern  VARCHAR(200) NOT NULL,
    canonical_key   VARCHAR(120) NOT NULL,
    category_code   VARCHAR(40)  REFERENCES product_categories(code),
    notes           TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (source_pattern, category_code)
);
CREATE INDEX idx_spec_label_pattern   ON spec_label_aliases(source_pattern);
CREATE INDEX idx_spec_label_canonical ON spec_label_aliases(canonical_key);
CREATE INDEX idx_spec_label_category  ON spec_label_aliases(category_code);

CREATE TABLE IF NOT EXISTS import_jobs (
    id               BIGSERIAL PRIMARY KEY,
    file_upload_id   BIGINT       NOT NULL REFERENCES file_uploads(id),
    job_type         VARCHAR(40)  NOT NULL CHECK (job_type IN ('SPEC_SHEET','CATALOG','PRICE','COMBINED')),
    target_category  VARCHAR(40),
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','PARTIALLY_COMPLETED')),
    total_items      INTEGER      NOT NULL DEFAULT 0,
    success_items    INTEGER      NOT NULL DEFAULT 0,
    failed_items     INTEGER      NOT NULL DEFAULT 0,
    rejected_items   INTEGER      NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    error_message    TEXT,
    created_by       BIGINT       NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_import_jobs_file    ON import_jobs(file_upload_id);
CREATE INDEX idx_import_jobs_status  ON import_jobs(status);
CREATE INDEX idx_import_jobs_creator ON import_jobs(created_by);
CREATE INDEX idx_import_jobs_time    ON import_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS import_job_items (
    id                BIGSERIAL PRIMARY KEY,
    import_job_id     BIGINT       NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    source_sheet      VARCHAR(80),
    source_row        INTEGER,
    action            VARCHAR(20)  NOT NULL CHECK (action IN ('INSERT','UPDATE','SKIP','ERROR')),
    target_table      VARCHAR(60),
    target_record_id  BIGINT,
    product_id        BIGINT       REFERENCES products(id),
    payload           JSONB,
    error_message     TEXT,
    processed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_import_items_job     ON import_job_items(import_job_id);
CREATE INDEX idx_import_items_action  ON import_job_items(action);
CREATE INDEX idx_import_items_product ON import_job_items(product_id);

CREATE TABLE IF NOT EXISTS import_reject_log (
    id                 BIGSERIAL PRIMARY KEY,
    import_job_id      BIGINT       NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    reject_type        VARCHAR(40)  NOT NULL CHECK (reject_type IN ('UNMATCHED_MODEL','UNKNOWN_LABEL','INVALID_VALUE','DUPLICATE')),
    source_sheet       VARCHAR(80),
    source_row         INTEGER,
    source_value       VARCHAR(255),
    suggested_action   TEXT,
    resolved           BOOLEAN      NOT NULL DEFAULT FALSE,
    resolved_by        BIGINT       REFERENCES users(id),
    resolved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reject_job     ON import_reject_log(import_job_id);
CREATE INDEX idx_reject_type    ON import_reject_log(reject_type);
CREATE INDEX idx_reject_value   ON import_reject_log(source_value);
CREATE INDEX idx_reject_pending ON import_reject_log(resolved) WHERE resolved = FALSE;

-- ============================================================================
-- 6. 트리거
--
-- ⚠️ 게시 요건(VRF 실외기는 max_connections 없이 PUBLISHED 불가)은 DB 트리거로 걸지 않는다.
--    애플리케이션(도메인) 단일 책임이다 — 주인님 확정 2026-07-13.
--    근거: 규칙이 이미 도메인에 테스트로 고정돼 있고, 같은 규칙을 두 곳에 두면 둘이 어긋날 때
--          어느 쪽이 정본인지 알 수 없다. DB는 '저장'만 하고 '판단'은 도메인이 한다.
--    (products만으로는 is_vrf가 보이지 않아 CHECK 제약으로는 표현할 수도 없다.)
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at        BEFORE UPDATE ON products        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- PUBLISHED 전환 시 published_at 자동 세팅
CREATE OR REPLACE FUNCTION trg_set_published_at() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'PUBLISHED' AND (OLD.status IS DISTINCT FROM 'PUBLISHED') THEN
        NEW.published_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_published_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trg_set_published_at();

-- ============================================================================
-- 7. 외부 노출 뷰
-- ============================================================================

-- 게시된 제품 카탈로그. 생성·검도는 이 뷰만 읽는다 → 조합 판단에 필요한 컬럼이 전부 실려야 한다.
CREATE OR REPLACE VIEW v_published_products AS
SELECT
    p.id,
    p.model_code,
    p.equipment_code,                 -- v3
    p.name_display,
    pc.code    AS category_code,
    pc.name_ko AS category_ko,
    psc.code    AS subcategory_code,
    psc.name_ko AS subcategory_ko,
    ps.code    AS series_code,
    ps.name_ko AS series_ko,
    ps.mfl_code,
    ps.is_vrf,                        -- v3
    rt.code    AS refrigerant_code,
    pw.display AS power_display,
    es.code    AS energy_source_code,
    p.horsepower,
    p.hp_source,                      -- v3
    p.cooling_capacity_w,
    p.heating_capacity_w,
    p.heating_capacity_cold_w,
    p.cop_cooling,
    p.cop_heating,
    p.max_connections,                -- v3
    p.combo_min,                      -- v3
    p.combo_max,                      -- v3
    p.manufacturer,
    p.published_at,
    p.discontinued_at
FROM products p
JOIN product_series ps         ON p.product_series_id = ps.id
JOIN product_subcategories psc ON ps.product_subcategory_id = psc.id
JOIN product_categories pc     ON psc.product_category_id = pc.id
LEFT JOIN refrigerant_types rt ON p.refrigerant_type_id = rt.id
LEFT JOIN power_supplies pw    ON p.power_supply_id = pw.id
LEFT JOIN energy_sources es    ON psc.energy_source_id = es.id
WHERE p.status = 'PUBLISHED';

-- 게시 제품 + 스펙(JSONB 롱테일). 중량·치수·소비전력은 여기서 읽는다.
CREATE OR REPLACE VIEW v_published_product_specs AS
SELECT
    p.id AS product_id,
    p.model_code,
    ps.spec_data
FROM products p
JOIN product_specs ps ON ps.product_id = p.id
WHERE p.status = 'PUBLISHED';

-- 게시 제품 + 현행 가격 (단가 데이터가 들어온 뒤에 의미를 갖는다)
CREATE OR REPLACE VIEW v_published_product_prices AS
SELECT
    p.id AS product_id,
    p.model_code,
    pt.code AS price_type_code,
    pp.price_krw,
    pp.price_with_vat_krw,
    pp.effective_start_date,
    pp.source_reference
FROM products p
JOIN product_prices pp ON pp.product_id = p.id
JOIN price_types pt    ON pp.price_type_id = pt.id
WHERE p.status = 'PUBLISHED'
  AND pp.effective_end_date IS NULL;

-- ETL 작업 대시보드용
CREATE OR REPLACE VIEW v_import_jobs_summary AS
SELECT
    ij.id, ij.job_type, ij.status,
    fu.file_name,
    ij.total_items, ij.success_items, ij.failed_items, ij.rejected_items,
    CASE WHEN ij.total_items = 0 THEN 0
         ELSE ROUND(100.0 * ij.success_items / ij.total_items, 2) END AS success_rate_pct,
    u.name AS created_by_name,
    ij.created_at, ij.completed_at,
    (SELECT COUNT(*) FROM import_reject_log r WHERE r.import_job_id = ij.id AND r.resolved = FALSE) AS pending_rejects
FROM import_jobs ij
JOIN file_uploads fu ON ij.file_upload_id = fu.id
JOIN users u         ON ij.created_by = u.id;

-- ----------------------------------------------------------------------------
-- 7-1. 롱테일 스펙을 조건으로 걸어야 할 때 — 정규화하지 말고 표현식 인덱스로 대응한다.
--      (지금은 필요 없다. 필요해질 때 주석을 풀어 쓴다.)
--
-- 예: 본체중량으로 필터·정렬
-- CREATE INDEX idx_specs_weight ON product_specs
--     (((spec_data #>> '{제품중량 > 본체중량,value}')::numeric));
--
-- 라벨 변종이 여럿이므로(SpecLookup 참조) 실제로는 COALESCE로 후보 키를 훑는 IMMUTABLE 함수를
-- 만들어 그 위에 인덱스를 건다. 컬럼을 늘려 NULL로 채우는 것보다 낫다.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 8. 전역 설정 초기값 — 조합비 기본 허용범위
--    (모델별 products.combo_min/combo_max가 있으면 그쪽이 우선한다)
-- ============================================================================

INSERT INTO system_settings (key, value, value_type, description) VALUES
    ('combo.ratio.min', '0.5',  'number', '조합비 전역 하한 (모델별 combo_min이 없을 때 적용)'),
    ('combo.ratio.max', '1.03', 'number', '조합비 전역 상한 (모델별 combo_max가 없을 때 적용)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- END OF DDL (v3)
-- ============================================================================
