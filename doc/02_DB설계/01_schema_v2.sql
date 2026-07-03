-- 도면검도시스템 v2 — 장비 마스터 DB
-- PostgreSQL 15+ DDL Script
-- 작성일: 2026-05-22
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

CREATE TABLE IF NOT EXISTS energy_sources (
    id       BIGSERIAL PRIMARY KEY,
    code     VARCHAR(20) NOT NULL UNIQUE,
    name_ko  VARCHAR(40) NOT NULL
);

-- ============================================================================
-- 2. 사용자/감사 (다른 테이블 참조)
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

-- API keys는 audit_logs에서 참조하므로 먼저 생성
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
CREATE INDEX idx_api_keys_active   ON api_keys(id) WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

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
    release_year             INTEGER
);
CREATE INDEX idx_product_series_subcat ON product_series(product_subcategory_id);
CREATE INDEX idx_product_series_mfl    ON product_series(mfl_code);

CREATE TABLE IF NOT EXISTS products (
    id                          BIGSERIAL PRIMARY KEY,
    product_series_id           BIGINT       NOT NULL REFERENCES product_series(id),
    model_code                  VARCHAR(60)  NOT NULL UNIQUE,
    name_display                VARCHAR(160),
    refrigerant_type_id         BIGINT       REFERENCES refrigerant_types(id),
    power_supply_id             BIGINT       REFERENCES power_supplies(id),
    efficiency_grade_id         SMALLINT     REFERENCES efficiency_grades(id),
    horsepower                  NUMERIC(5,2),
    cooling_capacity_w          INTEGER,
    heating_capacity_w          INTEGER,
    heating_capacity_cold_w     INTEGER,
    power_consumption_cool_w    INTEGER,
    power_consumption_heat_w    INTEGER,
    cop_cooling                 NUMERIC(4,2),
    cop_heating                 NUMERIC(4,2),
    weight_kg                   NUMERIC(7,2),
    dim_width_mm                INTEGER,
    dim_height_mm               INTEGER,
    dim_depth_mm                INTEGER,
    manufacturer                VARCHAR(60)  DEFAULT 'LG전자',
    status                      VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    published_at                TIMESTAMPTZ,
    discontinued_at             DATE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                  BIGINT       REFERENCES users(id),
    updated_by                  BIGINT       REFERENCES users(id)
);
CREATE INDEX idx_products_series       ON products(product_series_id);
CREATE INDEX idx_products_refrigerant  ON products(refrigerant_type_id);
CREATE INDEX idx_products_hp           ON products(horsepower);
CREATE INDEX idx_products_cool_w       ON products(cooling_capacity_w);
CREATE INDEX idx_products_heat_w       ON products(heating_capacity_w);
CREATE INDEX idx_products_status       ON products(status);
CREATE INDEX idx_products_published    ON products(published_at DESC);
CREATE INDEX idx_products_active       ON products(id) WHERE status = 'PUBLISHED' AND discontinued_at IS NULL;

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
    effective_end_date     DATE,
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
CREATE INDEX idx_reject_job       ON import_reject_log(import_job_id);
CREATE INDEX idx_reject_type      ON import_reject_log(reject_type);
CREATE INDEX idx_reject_value     ON import_reject_log(source_value);
CREATE INDEX idx_reject_pending   ON import_reject_log(resolved) WHERE resolved = FALSE;

-- ============================================================================
-- 6. 트리거 - updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at         BEFORE UPDATE ON products         FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER system_settings_updated_at  BEFORE UPDATE ON system_settings  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 트리거 - PUBLISHED 전환 시 published_at 자동 세팅
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
-- 7. 외부 노출 뷰 (API에서 직접 SELECT)
-- ============================================================================

-- 게시된 제품 카탈로그 (외부 API의 /products)
CREATE OR REPLACE VIEW v_published_products AS
SELECT
    p.id,
    p.model_code,
    p.name_display,
    pc.code AS category_code,
    pc.name_ko AS category_ko,
    psc.code AS subcategory_code,
    psc.name_ko AS subcategory_ko,
    ps.code AS series_code,
    ps.name_ko AS series_ko,
    ps.mfl_code,
    rt.code AS refrigerant_code,
    pw.display AS power_display,
    es.code AS energy_source_code,
    p.horsepower,
    p.cooling_capacity_w,
    p.heating_capacity_w,
    p.heating_capacity_cold_w,
    p.power_consumption_cool_w,
    p.power_consumption_heat_w,
    p.cop_cooling,
    p.cop_heating,
    p.weight_kg,
    p.dim_width_mm, p.dim_height_mm, p.dim_depth_mm,
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

-- 게시 제품 + 현행 가격 (외부 API의 /products/{id}/price)
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

-- 게시 제품 + 스펙 (JSONB)
CREATE OR REPLACE VIEW v_published_product_specs AS
SELECT
    p.id AS product_id,
    p.model_code,
    ps.spec_data
FROM products p
JOIN product_specs ps ON ps.product_id = p.id
WHERE p.status = 'PUBLISHED';

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

-- ============================================================================
-- 8. 운영 권한 — 외부 서비스용 read-only role 예시
-- ============================================================================

-- CREATE ROLE app_external_read NOLOGIN;
-- GRANT USAGE ON SCHEMA public TO app_external_read;
-- GRANT SELECT ON v_published_products, v_published_product_prices, v_published_product_specs TO app_external_read;
-- CREATE USER ext_quote_service WITH LOGIN PASSWORD '<password>' IN ROLE app_external_read;
-- (API 키 인증을 게이트웨이 레벨에서 처리한다면 본 role은 사용하지 않을 수 있음)

-- ============================================================================
-- END OF DDL (v2)
-- ============================================================================
