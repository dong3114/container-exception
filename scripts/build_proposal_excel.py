"""
Build comprehensive CERA Proposal & Specifications Excel Workbook (.xlsx)
"""
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def build_proposal_excel(output_path):
    wb = openpyxl.Workbook()
    
    # Common styles
    font_family = "Malgun Gothic"
    title_font = Font(name=font_family, size=15, bold=True, color="0F172A")
    subtitle_font = Font(name=font_family, size=10, italic=True, color="475569")
    h1_font = Font(name=font_family, size=12, bold=True, color="1E3A8A")
    th_font = Font(name=font_family, size=10, bold=True, color="0F172A")
    body_font = Font(name=font_family, size=9.5, color="1F2937")
    bold_body_font = Font(name=font_family, size=9.5, bold=True, color="1F2937")
    code_font = Font(name="Consolas", size=9, color="B91C1C")
    
    th_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    primary_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid") # blue-100
    
    thin_border_side = Side(style="thin", color="CBD5E1")
    cell_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    
    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    align_left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    align_right = Alignment(horizontal="right", vertical="center", wrap_text=True)

    # ---------------------------------------------------------
    # Sheet 1: 00_산출물개요
    # ---------------------------------------------------------
    ws0 = wb.active
    ws0.title = "00_산출물개요"
    ws0.views.sheetView[0].showGridLines = True
    
    ws0.cell(row=2, column=2, value="CERA 프로젝트 제안 및 요구사항·설계 통합 명세").font = title_font
    ws0.cell(row=3, column=2, value="Container Exception Recovery Agent — System Proposal & Data Dictionary Package").font = subtitle_font
    
    ws0.cell(row=5, column=2, value="■ 산출물 문서 구성 목록").font = h1_font
    headers0 = ["문서 번호", "문서명", "파일명", "문서 성격", "주요 대상 독자", "핵심 수록 내용"]
    for col_idx, h in enumerate(headers0, start=2):
        c = ws0.cell(row=6, column=col_idx, value=h)
        c.font = th_font
        c.fill = th_fill
        c.alignment = align_center
        c.border = cell_border
        
    doc_rows = [
        ("01", "프로젝트 기획 및 제안서", "01_PROJECT_PROPOSAL", "사업/서비스 기획", "경영진, 사업 기획자, 고객사", "추진 배경, D&D 문제 정의, 서비스 컨셉, 30대 부산항 실증 성과, 아키텍처 및 로드맵"),
        ("02", "요구사항 분석서 (SRS)", "02_REQUIREMENTS_SPECIFICATION", "기능/비기능 명세", "시스템 분석가, 프로젝트 매니저, 개발자", "6대 행위자, 40여 개 기능 요구사항(FR), 11개 비기능 요구사항(NFR), 외부 API 규격"),
        ("03", "화면 정의서 (UI Spec)", "03_UI_SCREEN_SPECIFICATION", "UI/UX 설계", "UI 디자이너, 프론트엔드 개발자, 운영자", "Control Tower 3단 레이아웃, 10대 컴포넌트 상세, 상태 전이 매트릭스, 디자인 시스템"),
        ("04", "테이블 정의서 (DB Spec)", "04_TABLE_DEFINITION_SPECIFICATION", "데이터 모델링", "백엔드/DB 개발자, 아키텍트", "이벤트 소싱 원칙, 개념 ERD, 7대 도메인 22개 물리 테이블 전수 명세 및 데이터 라이프사이클"),
    ]
    for r_idx, r in enumerate(doc_rows, start=7):
        for c_idx, val in enumerate(r, start=2):
            c = ws0.cell(row=r_idx, column=c_idx, value=val)
            c.font = bold_body_font if c_idx in [2, 3] else body_font
            c.border = cell_border
            c.alignment = align_center if c_idx in [2, 5] else align_left
            c.fill = white_fill if r_idx % 2 == 1 else alt_fill

    # ---------------------------------------------------------
    # Sheet 2: 01_요구사항명세서 (FR & NFR)
    # ---------------------------------------------------------
    ws1 = wb.create_sheet(title="01_요구사항명세")
    ws1.views.sheetView[0].showGridLines = True
    ws1.cell(row=2, column=2, value="CERA 기능 및 비기능 요구사항 명세 (SRS)").font = title_font
    
    headers1 = ["요구사항 ID", "분류", "요구사항 명칭", "우선순위", "적용 단계", "상세 요구사항 명세", "검증 방법"]
    for col_idx, h in enumerate(headers1, start=2):
        c = ws1.cell(row=4, column=col_idx, value=h)
        c.font = th_font
        c.fill = th_fill
        c.alignment = align_center
        c.border = cell_border
        
    req_data = [
        ("FR-ING-01", "입력 수집", "공통 이벤트 변환", "Must", "PoC", "모든 외부 입력을 표준 Event 형식으로 변환하여 불변 Event Store에 Append-Only 저장", "단위 테스트"),
        ("FR-ING-02", "입력 수집", "화물 관제 목록 업로드", "Must", "PoC", "B/L 및 컨테이너 목록 CSV/Excel 수신 및 ISO 6346 체크디지트 검증", "엑셀 업로드 검증"),
        ("FR-ING-03", "입력 수집", "현장 단축 이벤트 입력", "Must", "PoC", "운영자/현장의 1클릭 상태(도착, 입고, 반출, 거절 등) Event 기록", "UI 인터랙션 검증"),
        ("FR-ING-04", "입력 수집", "시설 수용량 변동 등록", "Must", "PoC", "창고 일일 수용 한계 급감(20->8대) 및 ODCY 야드 슬롯 변동 즉시 등록", "시나리오 11:00 검증"),
        ("FR-ING-05", "입력 수집", "거래처 발신자 자동 분류", "Must", "PoC", "이메일 발신자를 사전문서 등록부 기반으로 결정론적 식별. LLM 추론 배제", "등록부 매칭 테스트"),
        ("FR-ING-06", "입력 수집", "공공 API 자동 동기화", "Should", "PoC", "UNI-PASS, PORT-MIS 읽기 전용 동기화 및 원문 전문/fetched_at 불변 보관", "모의 피스처 검증"),
        ("FR-ING-07", "입력 수집", "실메일 채널 연동", "Must", "Tech Validation", "Gmail OAuth 2.0 기반 승인된 테스트 계정 실제 발송 및 수신 폴링", "메일 발송 실증"),
        ("FR-EVT-01", "이벤트소싱", "불변 이벤트 저장 원칙", "Must", "PoC", "이벤트 수정/삭제 금지, 정정은 supersedes 이벤트 발행으로만 처리", "DB Insert 룰 검증"),
        ("FR-REC-01", "상태 조율", "신뢰도 기반 상태 조율", "Must", "PoC", "출처 신뢰도 매트릭스(인간>파트너>공공>추출) 및 발생시각 기준 지배값 도출", "조율 알고리즘 검증"),
        ("FR-REC-02", "상태 조율", "데이터 상충(Conflict) 탐지", "Must", "PoC", "상호 모순된 사실 유입 시 Conflict 발행 및 운영자 확인 큐 전달", "충돌 시나리오 검증"),
        ("FR-REC-03", "상태 조율", "데이터 신선도 관리", "Must", "PoC", "주요 운영 데이터의 유효 시간 경과 시 STALE 전환 및 UI 경고 표시", "신선도 타이머 검증"),
        ("FR-STA-01", "정본 상태", "단일 운영 상태 산출", "Must", "PoC", "컨테이너별 Canonical State 및 값 보증(CONFIRMED/PROVISIONAL) 산출", "상태 일치율 검증"),
        ("FR-CON-01", "계약/비용", "Tariff 구조화 파싱", "Must", "PoC", "선사 B/L 계약서에서 Free Time, D&D 구간 요율 비정형 파싱", "계약서 추출 검증"),
        ("FR-CON-02", "계약/비용", "Tariff 버전 및 확정", "Must", "PoC", "추출 후보에 대한 인간 1회 확인 후 불변 버전 확정 룰로 승격", "룰 엔진 락 검증"),
        ("FR-CON-03", "계약/비용", "100% 결정론적 비용 산출", "Must", "PoC", "모든 D&D 및 운송료는 LLM 배제하고 파이썬 코드로 원화 정수 계산", "수기 검산 대비 오차 0원"),
        ("FR-RSK-01", "위험 평가", "LFD 및 위험 마감일 산출", "Must", "PoC", "확정 Tariff와 반입 시각 결합하여 컨테이너별 잔여 Free Time 계산", "D-Day 계산 검증"),
        ("FR-RSK-02", "위험 평가", "영향 대상 컨테이너 탐지", "Must", "PoC", "창고 수용량 급감 시 수용 불가로 탈락한 12대 위험 화물 즉시 식별", "11:00 탐지 검증"),
        ("FR-RSK-03", "위험 평가", "비용 노출액(Exposure) 정량화", "Must", "PoC", "방치 시 누적 페널티 총액(Baseline 465만원) 및 위험 등급 산출", "Exposure 수치 검증"),
        ("FR-OPT-01", "복구 최적화", "다중 컨테이너 복구 최적화", "Must", "PoC", "창고 직송, ODCY 경유, 대체 창고 우회 중 총비용 최소 배정해 산출", "Plan v1 산출 검증"),
        ("FR-OPT-02", "복구 최적화", "복구 효과 비교 가시화", "Must", "PoC", "Baseline vs Plan 비용 비교 및 81.5만 원 순수 절감액 표출", "KPI 대조 검증"),
        ("FR-OPT-03", "복구 최적화", "미확인 잠정 입력 고지", "Must", "PoC", "계획에 포함된 잠정(PROVISIONAL) 데이터 명시 및 승인 시 인지 동의", "승인 모달 검증"),
        ("FR-OPT-05", "복구 최적화", "파트너 회신 반영 재최적화", "Must", "PoC", "ODCY/운송사 실제 회신 조건 반영하여 Plan v2 실시간 갱신 산출", "Plan v2 재계산 검증"),
        ("FR-OPT-06", "복구 최적화", "계획 승인 분리 기록", "Must", "PoC", "계획 승인(Plan Approval)과 사실 확인(Verification)의 물리적 분리 저장", "독립 엔티티 검증"),
        ("FR-COM-01", "외부 소통", "부족 자원 문의 초안 생성", "Must", "PoC", "최적 복구안에 필요한 ODCY 보관 및 추가 트럭 문의 정형 초안 작성", "초안 3건 생성 검증"),
        ("FR-COM-02", "외부 소통", "인간 승인 기반 발송 게이트", "Must", "PoC", "운영자의 명시적 [발송 승인] 클릭 전에는 외부 발송 절대 불가", "Human Gate 차단 검증"),
        ("FR-RSP-01", "외부 소통", "비정형 회신 파싱 및 검증", "Must", "PoC", "수신 메일에서 가능 수량, 시간, 요율 추출 후 서버 검증기 거쳐 반영", "회신 파싱 검증"),
        ("FR-UI-01", "관제 대시보드", "Control Tower 단일 관제", "Must", "PoC", "30대 컨테이너, KPI, 수용량 게이지를 단일 화면에서 실시간 관제", "브라우저 구동 검증"),
        ("FR-UI-02", "관제 대시보드", "2D SVG 물류 운영 지도", "Must", "PoC", "터미널-ODCY-창고 간의 이동 경로 및 창고 병목 펄스 시각화", "SVG 렌더링 검증"),
        ("FR-AUD-01", "감사/통지", "전수 활동 감사 로그", "Must", "PoC", "모든 시스템 연산, AI 파싱, 운영자 승인 일시와 실행자 불변 보존", "Audit Trail 검증"),
        ("NFR-01", "비기능", "결정론 및 재현성 100%", "Must", "PoC", "동일 이벤트 로그 및 난수 시드 주입 시 100% 동일한 계획과 비용 산출", "3회 재생 해시 일치"),
        ("NFR-02", "비기능", "근거 추적성 (Traceability)", "Must", "PoC", "화면의 모든 비용 및 상태는 원천 Event ID로 1클릭 역추적 가능", "근거 링크 검증"),
        ("NFR-03", "비기능", "Human-in-the-Loop 안전성", "Must", "PoC", "사람 승인 없이 외부 메일 발송 또는 복구 계획 확정 코드 경로 부재", "우회 불가 검증"),
        ("NFR-04", "비기능", "최적화 계산 응답 시간", "Must", "PoC", "30대 컨테이너 기준 돌발 예외 접수부터 최적 복구 계획 수립까지 5초 이내", "솔버 3초 이내 검증"),
        ("NFR-06", "비기능", "데이터 단위 무결성 표준", "Must", "PoC", "모든 통화는 원화 정수(KRW BIGINT), 모든 시각은 Asia/Seoul (+09:00)", "부동소수점 검출 차단"),
    ]
    for r_idx, r in enumerate(req_data, start=5):
        for c_idx, val in enumerate(r, start=2):
            c = ws1.cell(row=r_idx, column=c_idx, value=val)
            c.font = bold_body_font if c_idx in [2, 4] else body_font
            c.border = cell_border
            c.alignment = align_center if c_idx in [2, 3, 5, 6] else align_left
            c.fill = white_fill if r_idx % 2 == 1 else alt_fill

    # ---------------------------------------------------------
    # Sheet 3: 02_화면정의목록
    # ---------------------------------------------------------
    ws2 = wb.create_sheet(title="02_화면정의목록")
    ws2.views.sheetView[0].showGridLines = True
    ws2.cell(row=2, column=2, value="CERA Operations Control Tower 화면 및 컴포넌트 정의").font = title_font
    
    headers2 = ["화면/컴포넌트 ID", "컴포넌트 명칭", "화면 내 위치", "주요 기능 및 목적", "주요 UI 요소", "데이터 바인딩 계약 (cera.ts)"]
    for col_idx, h in enumerate(headers2, start=2):
        c = ws2.cell(row=4, column=col_idx, value=h)
        c.font = th_font
        c.fill = th_fill
        c.alignment = align_center
        c.border = cell_border
        
    screens_data = [
        ("SCR-00", "PlaybackBar", "화면 최상단 글로벌 바", "시나리오 단계 재생 제어, KST 타임스탬프 표출 및 단계 요약 나레이션", "이전/재생/다음 버튼, 타임라인 프로그레스 바, As of 시계", "operations.narrative, meta.as_of"),
        ("SCR-01", "KpiStrip", "상단 지표 영역 (5개 카드)", "수입 화물 전체 위험 규모 및 경제적 손실액(Exposure), 절감액 실시간 요약", "전체 화물, 긴급 위험 화물, 창고 수용량, 방치 시 노출액, 복구 절감액", "OperationsSummary (exposure, saving, warehouse)"),
        ("SCR-02", "OperationsMap", "중앙 좌측 상단 (7 Col)", "부산 신항 터미널, ODCY A/B, 창고 A/B 간 지리적 배치 및 복구 경로 시각화", "터미널 노드, 창고/ODCY 노드, 경로 링크(직송/우회/경유), 병목 펄스", "ResourceStatus, RecoveryPlanView.actions"),
        ("SCR-03", "ExceptionPanel", "중앙 우측 상단 (5 Col)", "돌발 발생한 물류 예외의 원천, 영향 범위 및 초과 컨테이너 긴급 경보", "예외 타이틀, 감지 시각/출처, 변동 내역(20->8대), 영향 컨테이너 배지", "ActiveException, StepNarrative"),
        ("SCR-04", "ContainerTable", "중앙 좌측 하단 (7 Col)", "전체 30대 수입 컨테이너의 실시간 상태, 마일스톤, 위험도, 배정 경로 그리드", "위험도 필터 탭, LFD 카운트다운, 배정 경로(NEW 뱃지), 신뢰도 인디케이터", "ContainerView[], RiskView, FactView[]"),
        ("SCR-05", "ContainerDrawer", "우측 슬라이드 오버레이 패널", "특정 컨테이너의 마일스톤 타임라인, 선사 Tariff 룰, 대안 경로별 손익 분석", "요약 헤더, 이벤트 타임라인, Tariff 계산기 카드, 대안 경로별 비용 비교", "ContainerView, Milestone, CostBreakdown"),
        ("SCR-06", "RecoveryConsole", "중앙 우측 하단 (5 Col)", "최적화 솔버가 도출한 복구 계획(Plan v1/v2) 검토 및 최종 일괄 승인", "비용 비교 게이지, 시설별 배정 요약, 바인딩 제약 고지, 최종 승인 버튼", "RecoveryPlanView, BaselineView, RecoveryAction[]"),
        ("SCR-07", "Communications", "우측 하단 소통 탭/모달", "부족 자원 확보를 위한 대외 이메일 초안 검토, Human Gate 발송 승인, 회신 파싱", "거래처 스레드, 이메일 에디터, 발송 승인 버튼, 회신 파싱 요약 카드", "CommunicationThread[], MessageView, Extraction"),
        ("SCR-08", "DataTrustPanel", "하단 진단 탭", "데이터 출처별 신뢰도 분포, 신선도(Freshness), 상충(Conflict) 확인 큐", "출처 파이차트, 신선도 게이지, 검증 대기 큐(원클릭 확인/수정 액션)", "DataTrustSummary, VerificationRequestView[]"),
        ("SCR-09", "ActivityTimeline", "하단 타임라인 탭", "시스템 연산, AI 파싱, 운영자 승인 등 모든 활동의 시간순 전수 감사 스트림", "시간순 활동 리스트, 주체 배지(SYSTEM/AI/HUMAN), 상세 파라미터 뷰어", "ActivityItem[] (kind, actor, text, refs)"),
    ]
    for r_idx, r in enumerate(screens_data, start=5):
        for c_idx, val in enumerate(r, start=2):
            c = ws2.cell(row=r_idx, column=c_idx, value=val)
            c.font = bold_body_font if c_idx in [2, 3] else body_font
            c.border = cell_border
            c.alignment = align_center if c_idx in [2, 4] else align_left
            c.fill = white_fill if r_idx % 2 == 1 else alt_fill

    # ---------------------------------------------------------
    # Sheet 4: 03_테이블정의_총괄
    # ---------------------------------------------------------
    ws3 = wb.create_sheet(title="03_테이블정의_총괄")
    ws3.views.sheetView[0].showGridLines = True
    ws3.cell(row=2, column=2, value="CERA 데이터베이스 테이블 정의 총괄 목록").font = title_font
    
    headers3 = ["도메인 분류", "물리 테이블명", "논리 테이블명", "테이블 성격", "Primary Key", "컬럼 수", "주요 역할 및 설명"]
    for col_idx, h in enumerate(headers3, start=2):
        c = ws3.cell(row=4, column=col_idx, value=h)
        c.font = th_font
        c.fill = th_fill
        c.alignment = align_center
        c.border = cell_border
        
    tables_summary = [
        ("01_물류핵심", "container", "컨테이너", "마스터 엔티티", "container_id", 9, "수입 관제 대상 개별 컨테이너 물리 마스터 (ISO 6346 규격)"),
        ("01_물류핵심", "bl", "선하증권 (B/L)", "마스터 엔티티", "bl_id", 9, "해상 운송 및 통관의 기본 단위 선하증권 마스터"),
        ("02_시설자원", "facility", "물류 시설", "마스터 엔티티", "facility_id", 7, "터미널, 창고, ODCY 등 컨테이너가 장치/이동하는 모든 시설 상위"),
        ("02_시설자원", "warehouse", "창고 시설 상세", "서브 엔티티", "facility_id", 3, "목적지 보세창고의 수용 한계 스펙 및 운영 시간"),
        ("02_시설자원", "terminal", "부두 터미널 상세", "서브 엔티티", "facility_id", 3, "부산 신항 양하 부두 터미널 정보"),
        ("02_시설자원", "odcy", "ODCY 야드 상세", "서브 엔티티", "facility_id", 3, "부두외 컨테이너 장치장(ODCY)의 수용 능력 및 게이트 마감"),
        ("02_시설자원", "truck_pool", "차량 가용 풀", "운영 자원", "truck_pool_id", 6, "운송사별 시간대별 트럭 가용 대수 및 배정 현황"),
        ("03_사건상태", "raw_input", "원문 보관소", "불변 원장", "raw_input_id", 6, "공공 API 응답 XML, 수신 이메일, 엑셀 파일 등 외부 유입 원본 전문 불변 보존"),
        ("03_사건상태", "event", "운영 사건 원장", "불변 이벤트", "event_id", 12, "Reconciliation의 원천이 되는 모든 관측 사실 불변 Append-Only 원장"),
        ("03_사건상태", "canonical_fact", "정본 현재 사실", "물질화 상태", "entity_type, id, key", 9, "조율 엔진이 판정한 최신의 믿을 수 있는 현재 운영 상태"),
        ("03_사건상태", "conflict", "데이터 상충 기록", "예외 추적", "conflict_id", 7, "출처 간 정보 불일치 및 불일치 해소 추적 레코드"),
        ("03_사건상태", "planning_snapshot", "계획 입력 스냅샷", "불변 동결", "snapshot_id", 5, "복구 최적화 실행 시점의 모든 입력 데이터를 영구 동결한 스냅샷"),
        ("04_계약비용", "contract", "물류 계약", "마스터 엔티티", "contract_id", 7, "화주-선사 간 체결된 운송 계약 및 Tariff 조건"),
        ("04_계약비용", "tariff_rule", "요율 계산 규칙", "불변 엔진 룰", "rule_id", 11, "Free Time, D&D 구간별 요율 계산을 위한 결정론적 불변 수식"),
        ("04_계약비용", "rate_quote", "제안 견적 묶음", "운영 사실", "quote_id", 6, "ODCY 보관료 등 메일 회신으로 접수된 임시 견적"),
        ("04_계약비용", "cost_result", "비용 계산 결과", "계산 산출물", "cost_result_id", 7, "Baseline vs Plan 복구 실행별 총비용 및 절감액 스냅샷"),
        ("04_계약비용", "cost_line_item", "비용 내역 줄", "계산 상세", "cost_line_id", 6, "컨테이너별 D&D, 운송비, 보관료 상세 계산 내역"),
        ("05_계획", "recovery_run", "복구 계획 실행", "의사결정 버전", "run_id", 9, "최적화 솔버의 1회 계산 단위 (Plan v1, Plan v2)"),
        ("05_계획", "assignment", "컨테이너별 배정", "최적화 산출물", "assignment_id", 11, "컨테이너별 최종 확정 이동 경로, 경유지, 배정 시설 및 비용"),
        ("05_계획", "plan_decision", "계획 승인 결정", "불변 증빙", "decision_id", 7, "운영자의 복구 계획 승인/반려 의사결정 불변 증빙"),
        ("05_계획", "risk_assessment", "위험 평가 결과", "계산 산출물", "assessment_id", 6, "컨테이너별 위험 등급(Critical/High) 및 LFD 여유 시간"),
        ("06_외부통신", "counterparty", "외부 거래처", "마스터 엔티티", "counterparty_id", 5, "운송사, ODCY, 창고, 선사 법인 정보 마스터"),
        ("06_외부통신", "contact_channel_address", "채널 주소 정본", "보안/인증", "address_id", 7, "검증 완료된 이메일 주소 및 실제 발송 자격 관리"),
        ("06_외부통신", "question_item", "질문 항목 (Ask)", "소통 규격", "question_item_id", 6, "회신 값 매핑을 위한 사전 정의 정형 질문 규격"),
        ("06_외부통신", "comm_message", "외부 메시지 원장", "통신 원장", "message_id", 10, "송수신 이메일 전문, 멱등성 보장 키, 발송 상태 라이프사이클"),
        ("06_외부통신", "message_approval", "발송 승인 결정", "Human Gate", "approval_id", 7, "운영자의 대외 메일 발송 승인 내역 및 본문 해시 증빙"),
        ("06_외부통신", "extraction", "AI 추출 기록", "AI 파싱 원장", "extraction_id", 9, "수신 메일에서 LLM이 추출한 정형 후보 및 서버 검증기 판정 결과"),
        ("07_감사운영", "actor", "행동 주체", "거버넌스", "actor_id", 4, "인간 운영자, 결정론 엔진, AI 에이전트 주체 식별자"),
        ("07_감사운영", "audit_log", "감사 기록 원장", "불변 감사", "audit_id", 7, "시스템 내 모든 승인, 계산, 발송 이력을 추적하는 전수 감사 로그"),
    ]
    for r_idx, r in enumerate(tables_summary, start=5):
        for c_idx, val in enumerate(r, start=2):
            c = ws3.cell(row=r_idx, column=c_idx, value=val)
            c.font = bold_body_font if c_idx in [3, 4] else body_font
            c.border = cell_border
            c.alignment = align_center if c_idx in [2, 5, 6, 7] else align_left
            c.fill = white_fill if r_idx % 2 == 1 else alt_fill

    # Auto-adjust column widths for all sheets
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or '')
                # Approximate width for korean characters
                length = sum(2 if ord(char) > 128 else 1 for char in val)
                if length > max_len:
                    max_len = length
            sheet.column_dimensions[col_letter].width = min(max(max_len + 3, 10), 65)

    wb.save(output_path)
    print(f"Successfully generated Excel workbook at {output_path}")

if __name__ == '__main__':
    out_file = r"C:\Users\PC\Desktop\workspace\container_exception\data\Proposal\CERA_PROPOSAL_SPECIFICATIONS.xlsx"
    build_proposal_excel(out_file)
