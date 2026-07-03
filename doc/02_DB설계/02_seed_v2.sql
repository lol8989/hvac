-- 도면검도시스템 v2 — 초기 시드 데이터
-- ============================================================================

-- 냉매
INSERT INTO refrigerant_types (code, name, gwp) VALUES
    ('R410A', 'R410A', 2088), ('R32', 'R32', 675),
    ('R134a', 'R134a', 1430), ('R407C', 'R407C', 1774)
ON CONFLICT (code) DO NOTHING;

-- 연료
INSERT INTO fuel_types (code, name_ko, pressure_min_kpa, pressure_max_kpa) VALUES
    ('LNG_13A', 'LNG 13A', 2.0, 2.5), ('LPG', 'LPG', 2.3, 3.3)
ON CONFLICT (code) DO NOTHING;

-- 전원
INSERT INTO power_supplies (code, phase, wire, voltage_v, frequency_hz, display) VALUES
    ('1P_2W_220V_60HZ', 1, 2, 220, 60, '1 / 2 / 220 / 60'),
    ('3P_3W_220V_60HZ', 3, 3, 220, 60, '3 / 3 / 220 / 60'),
    ('3P_4W_380V_60HZ', 3, 4, 380, 60, '3 / 4 / 380 / 60'),
    ('3P_4W_460V_60HZ', 3, 4, 460, 60, '3 / 4 / 460 / 60'),
    ('3P_4W_440V_60HZ', 3, 4, 440, 60, '3 / 4 / 440 / 60')
ON CONFLICT (code) DO NOTHING;

-- 효율등급
INSERT INTO efficiency_grades (id, name) VALUES
    (1,'1등급'),(2,'2등급'),(3,'3등급'),(4,'4등급'),(5,'5등급')
ON CONFLICT (id) DO NOTHING;

-- 에너지원
INSERT INTO energy_sources (code, name_ko) VALUES
    ('EHP','전기 (EHP)'), ('GHP','가스 (GHP)'),
    ('AWHP','공기열원 히트펌프 (AWHP)'), ('GEOTHERMAL','지열'),
    ('WATER_COOLED','수냉식'), ('HYBRID','하이브리드')
ON CONFLICT (code) DO NOTHING;

-- 압축기
INSERT INTO compressor_types (code, type, qty_per_unit, oil_capacity_l, oil_model) VALUES
    ('SCROLL_x1','Scroll',1,3.2,'FVC68L'),
    ('SCROLL_x2','Scroll',2,6.4,'FVC68L'),
    ('RECIP_x1','Reciprocating',1,NULL,NULL)
ON CONFLICT (code) DO NOTHING;

-- 송풍기
INSERT INTO fan_types (code, type, motor_type) VALUES
    ('PROPELLER_BLDC','프로펠러식','BLDC'),
    ('PROPELLER_AC','프로펠러식','AC'),
    ('SIROCCO','시로코','BLDC')
ON CONFLICT (code) DO NOTHING;

-- 제품 대분류
INSERT INTO product_categories (code, name_ko, sort_order) VALUES
    ('OUTDOOR','실외기',1), ('INDOOR','실내기',2),
    ('VENT','환기',3), ('PANEL','판넬',4),
    ('MATERIAL','시공자재',5), ('CONTROL','제어/통신',6)
ON CONFLICT (code) DO NOTHING;

-- 가격 유형
INSERT INTO price_types (code, name_ko, priority) VALUES
    ('출하가','출하가',1), ('적용금액','적용금액',2),
    ('물가정보지','물가정보지',3), ('유통물가','유통물가',4)
ON CONFLICT (code) DO NOTHING;

-- 사용자 역할 (v2: API_CLIENT 추가)
INSERT INTO user_roles (code, name_ko) VALUES
    ('ADMIN','관리자'), ('EDITOR','편집자'),
    ('VIEWER','뷰어'), ('API_CLIENT','API 클라이언트')
ON CONFLICT (code) DO NOTHING;

-- 제품 태그 (v2 신규)
INSERT INTO product_tags (code, name_ko, color_hex) VALUES
    ('RECOMMENDED','추천','#0066CC'),
    ('NEW','신상','#00AA44'),
    ('EOL_SOON','단종예정','#FF6633'),
    ('LIMITED','한정판','#9933CC'),
    ('BESTSELLER','베스트셀러','#FFAA00'),
    ('ENERGY_GRADE_1','1등급 효율','#00AA44')
ON CONFLICT (code) DO NOTHING;

-- 시스템 환경설정 (v2 신규)
INSERT INTO system_settings (key, value, value_type, description) VALUES
    ('default_price_type', '출하가', 'string', '카탈로그 화면 기본 표시 가격유형'),
    ('catalog_publish_required_fields', 'cooling_capacity_w,heating_capacity_w,horsepower', 'string', 'PUBLISHED 전환 시 필수 컬럼'),
    ('api_default_page_size', '50', 'number', 'API 페이징 기본 size'),
    ('api_max_page_size', '500', 'number', 'API 페이징 최대 size'),
    ('etl_auto_publish', 'false', 'boolean', 'ETL 성공 시 자동으로 PUBLISHED 전환할지'),
    ('etl_reject_notify_email', 'admin@example.com', 'string', 'reject 발생 시 알림 이메일')
ON CONFLICT (key) DO NOTHING;

-- 스펙 라벨 표준화 (v2 신규 - 핵심 매핑 샘플)
INSERT INTO spec_label_aliases (source_pattern, canonical_key, category_code, notes) VALUES
    -- 능력
    ('능력.냉방(정격).kW',        'cooling.rated.kw',           NULL, 'GHP/Chiller 패턴'),
    ('능력.난방(정격).kW',        'heating.rated.kw',           NULL, 'GHP/Chiller 패턴'),
    ('냉방능력.정격.kW',          'cooling.rated.kw',           NULL, 'MV Super 패턴'),
    ('난방능력.정격.kW',          'heating.rated.kw',           NULL, 'MV Super 패턴'),
    ('냉방능력.공칭용량.W',       'cooling.rated.w',            NULL, 'MV IDU 패턴'),
    ('난방능력.공칭용량.W',       'heating.rated.w',            NULL, 'MV IDU 패턴'),
    ('능력.냉각.kW',              'cooling.rated.kw',           NULL, 'Chiller 패턴'),
    ('Nominal Capacity.-.-',      'cooling.rated.w',            'VENT', 'Ventilation 영문 패턴'),
    -- 소비전력
    ('소비 전력.실외기 냉방 (정격).kW',  'power.outdoor.cool.kw', NULL, 'GHP 패턴'),
    ('소비전력(냉방).정격.kW',           'power.cool.kw',         NULL, 'MV Super 패턴'),
    ('소비전력.강/중/약.W',              'power.high_mid_low.w',  'INDOOR', 'FCU/IDU 패턴'),
    -- 효율
    ('효율.냉방효율(COP).-',      'efficiency.cooling.cop',     NULL, ''),
    ('효율.난방효율(COP).-',      'efficiency.heating.cop',     NULL, ''),
    ('효율.통합냉방효율(IEER).W/W','efficiency.cooling.ieer',   NULL, 'MV Super/i'),
    ('효율.통합난방효율(COP).W/W', 'efficiency.heating.cop',    NULL, 'MV Super/i'),
    -- 냉매
    ('냉매.종류.-',               'refrigerant.code',           NULL, ''),
    ('냉매.충진량.kg',            'refrigerant.charge.kg',      NULL, ''),
    ('냉매.GWP (지구온난화지수).-','refrigerant.gwp',           NULL, ''),
    -- 치수/중량
    ('제품치수.본체치수(W x H x D).mm', 'dimension.body.whd_mm', NULL, ''),
    ('제품중량.본체중량.kg',            'weight.body.kg',        NULL, ''),
    -- 송풍기/팬
    ('실외 송풍기.형식.-',        'fan.outdoor.type',           'OUTDOOR', ''),
    ('실외 송풍기.풍량(High).m³/min','fan.outdoor.airflow.high.m3min', 'OUTDOOR', ''),
    ('송풍기.풍량(강/중/약).m³/min','fan.airflow.high_mid_low.m3min', 'INDOOR', ''),
    -- GHP 전용
    ('엔진.기관수 x 내경 x 행정.mm','engine.cylinders_bore_stroke',  NULL, 'GHP'),
    ('엔진.배기량.cc/Rev',         'engine.displacement.cc_rev',    NULL, 'GHP'),
    ('엔진.정격출력.PS',           'engine.rated_output.ps',        NULL, 'GHP'),
    ('사용연료.가스종.-',          'fuel.gas_type',                 NULL, 'GHP'),
    ('사용연료.가스압력.kPa',      'fuel.pressure.kpa',             NULL, 'GHP')
ON CONFLICT (source_pattern, category_code) DO NOTHING;
