# SQLite(POC) ↔ PostgreSQL(프로덕션) 스키마 대조 및 이관 설계

작성일: 2026-07-13
대상: `POC/src/infrastructure/equipment/sqlite/schema.ts` (SCHEMA_VERSION=4) ↔ `doc/02_DB설계/01_schema_v2.sql` (PostgreSQL v2)
**산출물: [`03_schema_v3.sql`](03_schema_v3.sql) — 이 문서의 결론을 반영한 프로덕션 DDL(배포 대상)**

> **이 문서의 성격**: 프로덕션 관계형 DB를 **먼저** 세우기 위한 설계 문서다.
> POC(SQLite) 코드는 **이 문서로 인해 즉시 바뀌지 않는다.** POC 반영은 후속 작업으로 미룬다(§6).
> 즉, 지금 정하는 것은 **프로덕션 PG 스키마가 무엇을 담아야 하는가**이고,
> POC는 나중에 이 결정에 맞춰 따라온다.
>
> §7의 미결정 3건은 **2026-07-13 전부 확정**되어 `03_schema_v3.sql`에 반영됐다.

---

## 0. 요약 — 결론부터

두 스키마는 **같지 않다.** 단순 서브셋도 아니다. 세 종류의 불일치가 있다.

| 유형 | 내용 | 조치 주체 |
|------|------|-----------|
| **A. PG에 없는 컬럼** | POC가 나중에 추가한 조합·게시 규칙 컬럼 6개가 PG DDL에 아예 없다 | **프로덕션 PG DDL 보강** (§2) — 지금 할 일 |
| **B. 컬럼명 불일치** | 3개 FK 컬럼의 이름이 다르다 | **PG 명명으로 통일**, POC가 나중에 따라옴 (§3) |
| **C. 정규화 수준 차이** | energy_source, system_settings 등의 표현이 다르다 | **PG(정규화)를 정본으로**, 이관 시 변환 (§4) |

핵심: **PG DDL v2(2026-05-22)는 POC보다 오래됐다.** POC가 그 뒤로 조합비·VRF·최대연결수 같은
비즈니스 규칙 컬럼을 실전에서 붙였는데, 그게 PG 설계에 반영되지 않았다.
**프로덕션을 그대로 세우면 생성(Generation) 도메인이 동작하지 않는다.**

---

## 1. 전체 대조표

### 1-1. 테이블 존재 여부

| 테이블 | SQLite(POC) | PG(v2) | 비고 |
|--------|:-----------:|:------:|------|
| product_categories | ✅ | ✅ | |
| product_subcategories | ✅ | ✅ | FK명·energy_source 표현 다름 |
| product_series | ✅ | ✅ | **is_vrf가 PG에 없음** |
| products | ✅ | ✅ | **컬럼 6개가 PG에 없음** |
| product_specs | ✅ | ✅ | |
| product_prices | ✅ | ✅ | SQLite에 `priority` 여분 |
| price_types | ✅ | ✅ | |
| efficiency_grades | ✅ | ✅ | |
| system_settings | ✅ | ✅ | **구조가 다름** |
| energy_sources | ❌ | ✅ | PG는 룩업 테이블, POC는 인라인 TEXT |
| refrigerant_types / power_supplies / compressor_types / fan_types | ❌ | ✅ | POC 미구현 |
| users / user_roles / api_keys / audit_logs / api_access_logs | ❌ | ✅ | POC 미구현(권한은 하드코딩) |
| file_uploads / spec_documents | ❌ | ✅ | POC 미구현 |
| import_jobs / import_job_items / import_reject_log / spec_label_aliases | ❌ | ✅ | POC 미구현(엑셀 업로드는 메모리 처리) |
| product_panels / product_combinations / indoor_outdoor_compat | ❌ | ✅ | POC 미구현 |
| product_tags / product_tag_assignments | ❌ | ✅ | POC 미구현 |
| price_change_logs | ❌ | ✅ | POC 미구현 |

POC에만 있고 PG에 없는 **테이블**은 없다. 문제는 테이블이 아니라 **컬럼**이다.

### 1-2. products 컬럼 대조

| 컬럼 | SQLite | PG(v2) | 판정 |
|------|:------:|:------:|------|
| id / model_code / name_display | ✅ | ✅ | 일치 |
| series_id | ✅ | `product_series_id` | **이름 불일치** |
| horsepower / cooling_capacity_w / heating_capacity_w / heating_capacity_cold_w | ✅ | ✅ | 일치 |
| cop_cooling / cop_heating / efficiency_grade_id | ✅ | ✅ | 일치 |
| status / published_at / discontinued_at / created_at / updated_at | ✅ | ✅ | 일치(NULL 제약만 다름, §5) |
| **equipment_code** | ✅ | ❌ | **PG에 추가 필요** |
| **hp_source** | ✅ | ❌ | **PG에 추가 필요** |
| **max_connections** | ✅ | ❌ | **PG에 추가 필요** |
| **combo_min / combo_max** | ✅ | ❌ | **PG에 추가 필요** |
| refrigerant_type_id / power_supply_id | ❌ | ✅ | POC 미구현 — PG 유지 |
| power_consumption_cool_w / power_consumption_heat_w | ❌ | ✅ | POC는 spec_data(JSON)에 보관 |
| weight_kg / dim_width_mm / dim_height_mm / dim_depth_mm | ❌ | ✅ | POC는 spec_data(JSON)에 보관 |
| manufacturer / created_by / updated_by | ❌ | ✅ | POC 미구현 — PG 유지 |

### 1-3. product_series 컬럼 대조

| 컬럼 | SQLite | PG(v2) | 판정 |
|------|:------:|:------:|------|
| subcategory_id | ✅ | `product_subcategory_id` | **이름 불일치** |
| code / name_ko / mfl_code | ✅ | ✅ | 일치 |
| **is_vrf** | ✅ | ❌ | **PG에 추가 필요** |
| release_year | ❌ | ✅ | POC 미사용 — PG 유지(무해) |

---

## 2. 프로덕션 PG DDL에 추가해야 할 것 (지금 할 일)

아래 6개 컬럼은 **비즈니스 규칙을 직접 결정**한다. 빠지면 실외기 선정·조합(`domain/generation/selectOutdoorUnits.ts`)과
게시 게이트가 성립하지 않는다.

```sql
-- ============================================================================
-- schema v3 보강 — POC(SQLite v4)에서 확립된 조합·게시 규칙 컬럼 역이식
-- ============================================================================

-- (1) 계열의 VRF 여부.
--     이 한 축이 세 가지를 함께 가른다:
--       ① 모델명이 마력(HP)을 인코딩하는가
--       ② 게시(PUBLISHED)에 최대 연결 실내기 수를 요구하는가
--       ③ 생성단 실외기 조합 후보로 노출되는가
--     실데이터에서 세 성질이 정확히 일치한다(칠러·CDU·단품은 모두 false).
--     근거: doc/05_설계결정/마력_환산식_적용_검토.md §5
ALTER TABLE product_series
    ADD COLUMN is_vrf BOOLEAN NOT NULL DEFAULT FALSE;

-- (2) 장비번호 단축코드 — 장비일람표 컬럼(실내기 '40C' 등)
ALTER TABLE products
    ADD COLUMN equipment_code VARCHAR(20);

-- (3) 마력 출처 — 환산식은 산출식이 아니라 검증·백필식이므로 출처를 남긴다
ALTER TABLE products
    ADD COLUMN hp_source VARCHAR(20)
        CHECK (hp_source IS NULL OR hp_source IN ('MODEL_CODE','DERIVED','CURATED','MANUAL'));

-- (4) 실외기 최대 연결 실내기 '대수'(실 개수가 아니다)
ALTER TABLE products
    ADD COLUMN max_connections SMALLINT
        CHECK (max_connections IS NULL OR max_connections > 0);

-- (5) 조합비 허용범위 모델별 override. NULL이면 system_settings의 전역 기본을 따른다.
ALTER TABLE products
    ADD COLUMN combo_min NUMERIC(4,2),
    ADD COLUMN combo_max NUMERIC(4,2);

ALTER TABLE products
    ADD CONSTRAINT chk_products_combo_range
        CHECK (combo_min IS NULL OR combo_max IS NULL OR combo_min <= combo_max);

-- (6) 전역 조합비 기본값 (SQLite system_settings와 같은 키)
INSERT INTO system_settings (key, value, value_type, description) VALUES
    ('combo.ratio.min', '0.5',  'number', '조합비 전역 하한 (모델별 combo_min이 없을 때)'),
    ('combo.ratio.max', '1.03', 'number', '조합비 전역 상한 (모델별 combo_max가 없을 때)')
ON CONFLICT (key) DO NOTHING;

-- (7) 조회 인덱스
CREATE INDEX idx_product_series_vrf   ON product_series(is_vrf);
CREATE INDEX idx_products_equip_code  ON products(equipment_code);
```

### 2-1. 외부 노출 뷰도 함께 갱신해야 한다

현행 `v_published_products`는 위 컬럼들을 **노출하지 않는다.** 생성 도메인이 뷰만 읽는다면 조합 판단이 불가능하다.

```sql
CREATE OR REPLACE VIEW v_published_products AS
SELECT
    p.id, p.model_code, p.equipment_code, p.name_display,
    pc.code AS category_code, pc.name_ko AS category_ko,
    psc.code AS subcategory_code, psc.name_ko AS subcategory_ko,
    ps.code AS series_code, ps.name_ko AS series_ko, ps.mfl_code,
    ps.is_vrf,                                    -- 추가
    rt.code AS refrigerant_code,
    pw.display AS power_display,
    es.code AS energy_source_code,
    p.horsepower, p.hp_source,                    -- 추가
    p.cooling_capacity_w, p.heating_capacity_w, p.heating_capacity_cold_w,
    p.power_consumption_cool_w, p.power_consumption_heat_w,
    p.cop_cooling, p.cop_heating,
    p.max_connections,                            -- 추가
    p.combo_min, p.combo_max,                     -- 추가
    p.weight_kg, p.dim_width_mm, p.dim_height_mm, p.dim_depth_mm,
    p.manufacturer, p.published_at, p.discontinued_at
FROM products p
JOIN product_series ps         ON p.product_series_id = ps.id
JOIN product_subcategories psc ON ps.product_subcategory_id = psc.id
JOIN product_categories pc     ON psc.product_category_id = pc.id
LEFT JOIN refrigerant_types rt ON p.refrigerant_type_id = rt.id
LEFT JOIN power_supplies pw    ON p.power_supply_id = pw.id
LEFT JOIN energy_sources es    ON psc.energy_source_id = es.id
WHERE p.status = 'PUBLISHED';
```

### 2-2. 게시 게이트 — **DB 트리거를 걸지 않는다** (확정, §7-1)

"VRF 계열 실외기는 max_connections 없이 게시 불가"는 **애플리케이션(도메인) 단일 책임**이다.
DB는 저장만 하고 판단하지 않는다.

---

## 3. FK 컬럼명 통일 (PG 명명이 정본)

| 테이블 | SQLite(현재) | **정본(PG)** |
|--------|--------------|--------------|
| product_subcategories | `category_id` | `product_category_id` |
| product_series | `subcategory_id` | `product_subcategory_id` |
| products | `series_id` | `product_series_id` |

의미는 동일하고 이름만 다르다. **PG 쪽을 정본으로 두고 POC가 나중에 따라온다**(§6).
PG DDL은 손댈 것이 없다.

---

## 4. 정규화 수준 차이 — PG를 정본으로

### 4-1. energy_source (계열)

- **SQLite**: `product_subcategories.energy_source TEXT` — 문자열 인라인('EHP', 'GHP', ...)
- **PG**: `energy_sources` 룩업 테이블 + `product_subcategories.energy_source_id BIGINT` FK

**PG(정규화)를 정본으로 유지한다.** 계열은 호환 판단의 기준이라 오타로 새 값이 생기면 안 된다.
이관 시 code → id 변환이 필요하다.

```sql
-- 이관 예시
UPDATE product_subcategories sc
   SET energy_source_id = es.id
  FROM energy_sources es
 WHERE es.code = <SQLite의 energy_source 문자열>;
```

### 4-2. system_settings

- **SQLite**: `key TEXT PRIMARY KEY, value TEXT` — 2컬럼
- **PG**: `id, key(UNIQUE), value, value_type, description, updated_at, updated_by`

**PG를 정본으로 유지한다.** 이관 시 `value_type`은 조합비 키에 대해 `'number'`로 채운다(§2 (6)에 포함).

### 4-3. product_prices.priority — **PG에 추가하지 않는다** (확정, §7-2)

SQLite `product_prices`에 `priority` 컬럼이 있으나 PG에는 없다.
**스펙시트에 단가가 없으므로** 단가는 이관 범위에서 제외되고, 우선순위 축은 `price_types.priority` 하나로 충분하다.
POC의 레코드별 `priority`는 목업 단가에 딸린 잉여 컬럼이다.

---

## 5. 데이터 이관 시 터지는 제약들 (체크리스트)

| # | 항목 | SQLite | PG | 이관 조치 |
|---|------|--------|----|-----------|
| 1 | `products.created_at` / `updated_at` | nullable TEXT | **NOT NULL** TIMESTAMPTZ | NULL 행이 있으면 INSERT 실패 → `COALESCE(created_at, NOW())` |
| 2 | 날짜 타입 | TEXT (`'2026-07-13'`) | DATE / TIMESTAMPTZ | 명시적 캐스팅. 형식 불일치 행 사전 검증 |
| 3 | boolean | INTEGER (0/1) | BOOLEAN | `is_vrf = (v <> 0)` |
| 4 | JSON | TEXT | JSONB | `spec_data::jsonb`. 파싱 실패 행 사전 검증 |
| 5 | 가격 기간 | 제약 없음 | `chk_price_dates` (종료일 ≥ 시작일) | 위반 행이 있으면 거부됨 → 사전 스캔 |
| 6 | `product_specs` 삭제 전파 | FK만 (CASCADE 없음) | `ON DELETE CASCADE` | PG가 더 엄격. 무해 |
| 7 | 조합비 범위 | 제약 없음 | `chk_products_combo_range` (§2) | `combo_min > combo_max` 행 사전 스캔 |
| 8 | AUTO PK | INTEGER PRIMARY KEY | BIGSERIAL | id를 명시 INSERT하면 시퀀스를 `setval()`로 맞춰야 함 |

**사전 검증 쿼리(SQLite에서 먼저 돌린다):**

```sql
SELECT 'null_ts',   COUNT(*) FROM products WHERE created_at IS NULL OR updated_at IS NULL
UNION ALL SELECT 'bad_price_dates', COUNT(*) FROM product_prices
          WHERE effective_end_date IS NOT NULL AND effective_end_date < effective_start_date
UNION ALL SELECT 'bad_combo', COUNT(*) FROM products
          WHERE combo_min IS NOT NULL AND combo_max IS NOT NULL AND combo_min > combo_max
UNION ALL SELECT 'bad_json', COUNT(*) FROM product_specs WHERE json_valid(spec_data) = 0;
```

전부 0이어야 이관을 시작한다.

---

## 6. POC(SQLite) 후속 적용 — **지금은 하지 않는다**

프로덕션 PG가 확정된 뒤, POC를 아래대로 맞춘다. (백로그: `doc/NEXT.md`)

- [ ] FK 컬럼명 3개를 PG 명명으로 리네임 (`schema.ts` / `seed.ts` / `SqliteEquipmentAdminRepository.ts` / `SqliteEquipmentMaster.ts` — **이 4개 파일에만 걸린다. 테스트는 컬럼명을 직접 참조하지 않아 무영향**)
- [ ] `SCHEMA_VERSION` 4 → 5 (IndexedDB 캐시 무효화)
- [ ] `product_prices.priority` 존치 여부 결정 후 정리 (§4-3)
- [ ] energy_source 인라인 TEXT 유지 여부 결정 — POC는 룩업 테이블 없이 두는 편이 단순하므로 **이관 시점에만 변환**하는 쪽을 권장

---

## 7. 결정 사항 (2026-07-13 확정 — `03_schema_v3.sql`에 반영 완료)

### 7-1. 게시 요건 이중 방어 → **애플리케이션 단일 책임** (주인님 확정)

VRF 실외기의 `max_connections` 필수 규칙을 DB 트리거로 **걸지 않는다.**

같은 규칙을 도메인과 DB 두 곳에 두면, 둘이 어긋났을 때 어느 쪽이 정본인지 알 수 없다.
규칙은 이미 도메인에 테스트로 고정돼 있다. **DB는 저장하고, 판단은 도메인이 한다.**
(부수적으로, `products`만으로는 `is_vrf`(series 소속)가 보이지 않아 CHECK 제약으로는 표현할 수도 없다.)

### 7-2. 단가 → **이관 범위에서 제외** (주인님 확정)

**스펙시트에 단가가 없다.** 따라서 초기 이관 데이터도 없다.

- 가격 테이블(`price_types`·`product_prices`·`price_change_logs`) **구조는 유지**한다(추후 단가 소스가 생길 때 쓴다).
- 우선순위 축은 **`price_types.priority` 하나뿐**이다. SQLite의 `product_prices.priority`는 PG에 **추가하지 않는다.**
- POC 시드의 단가·등급·COP는 플레이스홀더(목업)이므로 프로덕션으로 옮기지 않는다.

### 7-3. spec_data 승격 → **승격하지 않는다 (JSONB 유지)** — 실데이터 근거로 판단

PG DDL v2의 `power_consumption_cool_w`·`power_consumption_heat_w`·`weight_kg`·`dim_width_mm`·`dim_height_mm`·`dim_depth_mm`
컬럼을 **v3에서 제거**한다. 이 값들은 `product_specs.spec_data`(JSONB)에 남긴다.

실데이터(`public/equipment-seed.json`, 1,206모델 전수) 확인 결과:

| 후보 | 채움률 | 값 형태 |
|------|--------|---------|
| 소비전력(냉방) 정격 | **46.5%** (561/1206) | 실외기는 스칼라, **실내기는 `"11 / - / -"`(강/중/약 3값)** |
| 소비전력(난방) 정격 | **38.1%** (459/1206) | 〃 |
| 제품중량 본체중량 | 74.5% (898/1206) | `{"value":"11.7","unit":"kg"}` — 스칼라 |
| 제품치수 본체치수 | 74.0% (892/1206) | **`"860 x 132 x 450"` 결합 문자열** (+ `"1 125 x ..."` 천단위 공백 변종) |

판단 근거 넷:

1. **채움률이 과반 미만이다** — 소비전력은 절반 이상이 NULL인 컬럼이 된다. NULL로 채워진 정규화 컬럼은 "정규화했다"는 착각만 준다.
2. **값이 스칼라가 아니다** — 실내기 소비전력은 강/중/약 3값이라 컬럼 하나에 안 들어가고, 치수는 W×H×D 결합 문자열이라 3컬럼으로 쪼개려면 파서와 실패 처리가 필요하다(천단위 공백 변종 존재).
3. **쿼리 조건으로 쓰이지 않는다** — 조합·선정 판단에 쓰이는 값(용량·HP·maxConnections·조합비·계열)은 전부 이미 정규화돼 있다. 유일한 반례 후보였던 실외기 이격거리 검증조차 `domain/generation/clearanceRules.ts`가 **모델별 치수가 아니라 상수(`ODU_BODY_W_MM`/`ODU_BODY_D_MM`)를 쓴다.** 이 값들은 장비일람표에 **표시**될 뿐이다.
4. **조회 경로가 이미 있다** — `domain/equipment/SpecLookup.ts`가 라벨 변종(`제품중량 > 본체중량` 898건 / `제품 중량 > 본체 중량` 232건)을 별칭 배열로 흡수해 JSONB에서 읽고, 테스트로 고정돼 있다. 승격하면 같은 값이 두 곳에 살면서 서로 어긋날 수 있다(SRP 위반).

**나중에 이 값들로 필터·정렬해야 한다면** 컬럼을 늘리지 말고 **JSONB 표현식 인덱스**로 대응한다.
라벨 변종이 여럿이므로 후보 키를 `COALESCE`로 훑는 IMMUTABLE 함수 위에 인덱스를 건다.
(`03_schema_v3.sql` §7-1에 주석으로 준비해 뒀다.)

> 이 결정은 CLAUDE.md §4의 스펙 필드 전략("장비일람표 전 컬럼을 필수 정규화 필드로,
> 제품군 고유 항목은 JSONB 확장 스펙으로")과 충돌하지 않는다. 중량·치수·소비전력은
> 일람표에 **표시**되지만 판단에 쓰이지 않는 롱테일이고, 실제로 `SpecImport.ts`도
> 이미 이들을 "롱테일 → JSONB"로 분류하고 있다.
