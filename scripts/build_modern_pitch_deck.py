"""
Generate a modern, sophisticated 16:9 widescreen B2B SaaS Pitch Deck (PPTX)
incorporating 2026 'Linear-inspired' design standards:
- Conclusion-first action headlines
- Big-number KPI metric callout cards
- Clean component-driven card containers
- East Asian font rendering (Malgun Gothic / Pretendard)
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls

# -----------------------------------------------------------------------------
# Visual Design Tokens (Linear / Modern Keynote System)
# -----------------------------------------------------------------------------
FONT_FAMILY = "Malgun Gothic"
FONT_CODE = "Consolas"

# Dark Theme Palette (Deep Obsidian & Glow Accents)
C_DARK_BG = RGBColor(11, 15, 25)              # #0B0F19
C_DARK_SURFACE = RGBColor(19, 26, 42)         # #131A2A
C_DARK_CARD = RGBColor(26, 36, 56)            # #1A2438
C_DARK_BORDER = RGBColor(45, 60, 88)          # #2D3C58
C_TEXT_WHITE = RGBColor(248, 250, 252)        # #F8FAFC
C_TEXT_MUTED = RGBColor(148, 163, 184)        # #94A3B8

# Light Theme Palette (Clean Porcelain)
C_LIGHT_BG = RGBColor(248, 250, 252)         # #F8FAFC
C_LIGHT_SURFACE = RGBColor(255, 255, 255)    # #FFFFFF
C_LIGHT_BORDER = RGBColor(226, 232, 240)     # #E2E8F0
C_TEXT_DARK = RGBColor(15, 23, 42)           # #0F172A
C_TEXT_DARK_MUTED = RGBColor(71, 85, 105)    # #475569

# Accent Colors
C_ACCENT_BLUE = RGBColor(59, 130, 246)       # #3B82F6 Vibrant Blue
C_ACCENT_CYAN = RGBColor(6, 182, 212)        # #06B6D4
C_ACCENT_EMERALD = RGBColor(16, 185, 129)    # #10B981 Verified / Saving
C_ACCENT_AMBER = RGBColor(245, 158, 11)      # #F59E0B Warning / Watch
C_ACCENT_RED = RGBColor(239, 68, 68)         # #EF4444 Danger / Baseline

TOTAL_SLIDES = 6

def apply_font(run, font_name=FONT_FAMILY, size_pt=14, bold=False, color_rgb=C_TEXT_DARK):
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.color.rgb = color_rgb
    run.font.name = font_name
    rPr = run._r.get_or_add_rPr()
    for child in list(rPr):
        if child.tag.endswith('ea'):
            rPr.remove(child)
    ea = parse_xml(f'<a:ea {nsdecls("a")} typeface="{font_name}"/>')
    rPr.append(ea)

def add_header(slide, eyebrow, title, subtitle=None, dark_theme=False):
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.55), Inches(11.733), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    p0 = tf.paragraphs[0]
    p0.space_after = Pt(2)
    r0 = p0.add_run()
    r0.text = eyebrow.upper()
    apply_font(r0, font_name=FONT_CODE, size_pt=9.5, bold=True, 
               color_rgb=C_ACCENT_CYAN if dark_theme else C_ACCENT_BLUE)

    p1 = tf.add_paragraph()
    p1.space_after = Pt(3)
    r1 = p1.add_run()
    r1.text = title
    apply_font(r1, font_name=FONT_FAMILY, size_pt=22, bold=True,
               color_rgb=C_TEXT_WHITE if dark_theme else C_TEXT_DARK)

    if subtitle:
        p2 = tf.add_paragraph()
        r2 = p2.add_run()
        r2.text = subtitle
        apply_font(r2, font_name=FONT_FAMILY, size_pt=11.5, bold=False,
                   color_rgb=C_TEXT_MUTED if dark_theme else C_TEXT_DARK_MUTED)

def add_card(slide, left, top, width, height, bg_color=C_LIGHT_SURFACE, border_color=C_LIGHT_BORDER):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape

def add_footer(slide, current_idx, dark_theme=False):
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(7.05), Inches(11.733), Inches(0.3))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    r1 = p.add_run()
    r1.text = "CERA  |  Container Exception Recovery Agent"
    apply_font(r1, font_name=FONT_FAMILY, size_pt=8.5, bold=False,
               color_rgb=C_DARK_BORDER if dark_theme else RGBColor(148, 163, 184))
    r_space = p.add_run()
    r_space.text = " " * 80
    r2 = p.add_run()
    r2.text = f"{current_idx:02d} / {TOTAL_SLIDES:02d}"
    apply_font(r2, font_name=FONT_CODE, size_pt=8.5, bold=True,
               color_rgb=C_DARK_BORDER if dark_theme else RGBColor(148, 163, 184))

def build_pitch_deck(output_pptx):
    prs = Presentation()
    prs.slide_width = Inches(13.333) # 16:9 Widescreen
    prs.slide_height = Inches(7.5)
    blank_slide_layout = prs.slide_layouts[6]

    # -------------------------------------------------------------------------
    # Slide 1: Cover Slide (Dark Modern Theme)
    # -------------------------------------------------------------------------
    s1 = prs.slides.add_slide(blank_slide_layout)
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = C_DARK_BG
    bg1.line.fill.background()

    # Pill Badge
    pill = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.8), Inches(2.8), Inches(0.4))
    pill.fill.solid()
    pill.fill.fore_color.rgb = C_DARK_SURFACE
    pill.line.color.rgb = C_ACCENT_BLUE
    tf_p = pill.text_frame
    tf_p.margin_left = tf_p.margin_right = tf_p.margin_top = tf_p.margin_bottom = 0
    p = tf_p.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = "OPERATIONS DECISION LAYER"
    apply_font(r, font_name=FONT_CODE, size_pt=9.5, bold=True, color_rgb=C_ACCENT_CYAN)

    # Title & Subtitle
    tb_title = s1.shapes.add_textbox(Inches(1.2), Inches(2.4), Inches(10.5), Inches(3.0))
    tf_t = tb_title.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = tf_t.margin_right = tf_t.margin_top = tf_t.margin_bottom = 0
    
    p_t1 = tf_t.paragraphs[0]
    p_t1.space_after = Pt(8)
    r_t1 = p_t1.add_run()
    r_t1.text = "CERA : Container Exception Recovery Agent"
    apply_font(r_t1, font_name=FONT_FAMILY, size_pt=34, bold=True, color_rgb=C_TEXT_WHITE)

    p_t2 = tf_t.add_paragraph()
    p_t2.space_after = Pt(16)
    r_t2 = p_t2.add_run()
    r_t2.text = "수입 컨테이너 예외 복구 지능화 및 총비용 최소화 의사결정 플랫폼"
    apply_font(r_t2, font_name=FONT_FAMILY, size_pt=18, bold=False, color_rgb=C_ACCENT_CYAN)

    p_t3 = tf_t.add_paragraph()
    r_t3 = p_t3.add_run()
    r_t3.text = "창고 입고 거절 · D&D 마감 임박 시, 트럭·ODCY 제약 안에서 여러 컨테이너의 최적 복구계획을 1초 만에 산출합니다."
    apply_font(r_t3, font_name=FONT_FAMILY, size_pt=13, bold=False, color_rgb=C_TEXT_MUTED)

    # Bottom Meta Cards (3 small badges)
    meta_items = [
        ("부산항 Import FCL 실증", "30대 기준 시나리오 검증 완료"),
        ("순수 비용 절감", "방치 대비 81.5만 원 즉각 방어"),
        ("인간 협업 통제", "100% Human Gate 발송 및 승인")
    ]
    for idx, (m_title, m_desc) in enumerate(meta_items):
        cx = Inches(1.2 + idx * 3.7)
        card = add_card(s1, cx, Inches(5.6), Inches(3.5), Inches(1.05), bg_color=C_DARK_CARD, border_color=C_DARK_BORDER)
        tf_c = card.text_frame
        tf_c.margin_left = Inches(0.2); tf_c.margin_top = Inches(0.18)
        p1 = tf_c.paragraphs[0]
        r1 = p1.add_run()
        r1.text = m_title
        apply_font(r1, font_name=FONT_FAMILY, size_pt=11, bold=True, color_rgb=C_TEXT_WHITE)
        p2 = tf_c.add_paragraph()
        r2 = p2.add_run()
        r2.text = m_desc
        apply_font(r2, font_name=FONT_FAMILY, size_pt=9.5, color_rgb=C_TEXT_MUTED)

    add_footer(s1, 1, dark_theme=True)

    # -------------------------------------------------------------------------
    # Slide 2: The Core Problem (Conclusion-First)
    # -------------------------------------------------------------------------
    s2 = prs.slides.add_slide(blank_slide_layout)
    add_header(s2, "THE PAIN POINT", 
               "수입 컨테이너 예외 발생 시, 1대의 지연이 수백만 원의 D&D 페널티 폭탄으로 이어집니다.",
               "공공 데이터는 지연되고 전화·메일 소통은 파편화되어 진실 확인과 최적 대안 수립에 반나절을 허비합니다.")

    problems = [
        ("01. 데이터 신뢰도 붕괴", "공공 통관 API는 3~6시간 뒤늦게 업데이트되고, 운송사 통보와 현장 전산이 상충합니다. '지금 무엇을 믿어야 하는지' 확신할 수 없습니다.", C_ACCENT_AMBER),
        ("02. D&D 페널티 기하급수 누적", "선사 Free Time(7~10일)이 경과하면 하루 1대당 5~10만 원의 페널티가 복리로 청구됩니다. 12대만 묶여도 하루 100만 원 이상 증발합니다.", C_ACCENT_RED),
        ("03. 다자간 수기 소통의 병목", "창고, ODCY, 운송사 5곳에 일일이 전화하고 메일을 써서 가용 여부를 묻는 데 3~4시간이 걸려 골든타임을 놓치게 됩니다.", C_ACCENT_BLUE)
    ]
    for idx, (p_title, p_desc, accent_color) in enumerate(problems):
        cx = Inches(0.8 + idx * 3.95)
        card = add_card(s2, cx, Inches(2.2), Inches(3.75), Inches(4.4), bg_color=C_LIGHT_SURFACE, border_color=C_LIGHT_BORDER)
        
        # Header strip inside card
        strip = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, Inches(2.2), Inches(3.75), Inches(0.1))
        strip.fill.solid()
        strip.fill.fore_color.rgb = accent_color
        strip.line.fill.background()

        tf_card = card.text_frame
        tf_card.word_wrap = True
        tf_card.margin_left = Inches(0.3); tf_card.margin_right = Inches(0.3); tf_card.margin_top = Inches(0.4)
        
        p1 = tf_card.paragraphs[0]
        p1.space_after = Pt(12)
        r1 = p1.add_run()
        r1.text = p_title
        apply_font(r1, font_name=FONT_FAMILY, size_pt=14, bold=True, color_rgb=C_TEXT_DARK)
        
        p2 = tf_card.add_paragraph()
        r2 = p2.add_run()
        r2.text = p_desc
        apply_font(r2, font_name=FONT_FAMILY, size_pt=10.5, color_rgb=C_TEXT_DARK_MUTED)

    add_footer(s2, 2)

    # -------------------------------------------------------------------------
    # Slide 3: Paradigm Shift (As-Is vs To-Be Component Card)
    # -------------------------------------------------------------------------
    s3 = prs.slides.add_slide(blank_slide_layout)
    add_header(s3, "PARADIGM SHIFT", 
               "단순 위치 조회가 아닌, '지금 무엇을 해야 총손실이 최소인가?'를 제시하는 의사결정 레이어",
               "CERA는 기록 시스템(System of Record)을 대체하지 않고 그 위에서 최적 행동을 이끄는 Action Layer입니다.")

    # 2 Comparison Columns
    col_width = Inches(5.7)
    # Left: As-Is
    card_asis = add_card(s3, Inches(0.8), Inches(2.2), col_width, Inches(4.5), bg_color=RGBColor(254, 242, 242), border_color=RGBColor(254, 202, 202))
    tf_asis = card_asis.text_frame
    tf_asis.word_wrap = True
    tf_asis.margin_left = Inches(0.4); tf_asis.margin_right = Inches(0.4); tf_asis.margin_top = Inches(0.3)
    p_a0 = tf_asis.paragraphs[0]; p_a0.space_after = Pt(8)
    r_a0 = p_a0.add_run(); r_a0.text = "기존 TMS / ERP 방식 (As-Is)"
    apply_font(r_a0, font_name=FONT_FAMILY, size_pt=14, bold=True, color_rgb=C_ACCENT_RED)
    
    asis_points = [
        "• 질문: '컨테이너가 지금 어디에 있는가?' (단순 현황 조회)",
        "• 공공 API나 상대방 말을 무비판적으로 신뢰하다 낭패",
        "• 예외 발생 시 담당자 직관에 의존해 건별 땜질식 배차",
        "• D&D 페널티와 보관료는 청구서 나온 뒤 사후 정산",
        "• 운송사·ODCY 5곳에 수기 전화·메일 취합 (3~4시간 소요)"
    ]
    for pt in asis_points:
        p = tf_asis.add_paragraph(); p.space_after = Pt(6)
        r = p.add_run(); r.text = pt
        apply_font(r, font_name=FONT_FAMILY, size_pt=10.5, color_rgb=RGBColor(153, 27, 27))

    # Right: To-Be (CERA)
    card_tobe = add_card(s3, Inches(6.8), Inches(2.2), col_width, Inches(4.5), bg_color=RGBColor(236, 253, 245), border_color=RGBColor(167, 243, 208))
    tf_tobe = card_tobe.text_frame
    tf_tobe.word_wrap = True
    tf_tobe.margin_left = Inches(0.4); tf_tobe.margin_right = Inches(0.4); tf_tobe.margin_top = Inches(0.3)
    p_t0 = tf_tobe.paragraphs[0]; p_t0.space_after = Pt(8)
    r_t0 = p_t0.add_run(); r_t0.text = "CERA 플랫폼 방식 (To-Be)"
    apply_font(r_t0, font_name=FONT_FAMILY, size_pt=14, bold=True, color_rgb=C_ACCENT_EMERALD)

    tobe_points = [
        "• 핵심 질문: '지금 무엇을 믿을 수 있고, 무엇을 해야 총손실이 최소인가?'",
        "• 모든 입력을 신뢰도·신선도 메타가 붙은 이벤트로 다루고 Reconciliation 조율",
        "• 수십 대의 Free Time·보관료·트럭 제약을 연립하여 전체 최적 복구 계획 자동 산출",
        "• 계약 요율 기반 실시간 위험 노출액(Exposure) 및 절감액(Saving) 1원 단위 가시화",
        "• 원클릭 문의 초안 생성 → 인간 승인 → 회신 자동 파싱 및 실시간 재최적화 (10분 완료)"
    ]
    for pt in tobe_points:
        p = tf_tobe.add_paragraph(); p.space_after = Pt(6)
        r = p.add_run(); r.text = pt
        apply_font(r, font_name=FONT_FAMILY, size_pt=10.5, color_rgb=RGBColor(6, 95, 70))

    add_footer(s3, 3)

    # -------------------------------------------------------------------------
    # Slide 4: Real-World Scenario Proof (Squint-Test Big Numbers)
    # -------------------------------------------------------------------------
    s4 = prs.slides.add_slide(blank_slide_layout)
    add_header(s4, "PROVEN PERFORMANCE", 
               "부산항 30대 Import FCL 실증 — 11:00 창고 급감 돌발 예외 시 81.5만 원 순수 비용 절감",
               "가상이 아닌 실제 부산항 물류 환경과 선사 Tariff를 100% 반영한 시나리오 검증 결과입니다.")

    metrics = [
        ("방치 시 D&D 노출액", "465만 원", "창고 수용 불가로 12대 적체 시 발생할 순수 페널티 손실", C_ACCENT_RED),
        ("CERA 1차 복구 계획", "383.5만 원", "직송 8대 + ODCY 임시보관 4대 + 우회 배정 최적해", C_ACCENT_BLUE),
        ("순수 방어 절감액", "81.5만 원", "복구 계획 적용 즉시 방어한 순수 비용 (절감률 17.5%)", C_ACCENT_EMERALD)
    ]
    for idx, (m_label, m_num, m_sub, accent_c) in enumerate(metrics):
        cx = Inches(0.8 + idx * 3.95)
        card = add_card(s4, cx, Inches(2.2), Inches(3.75), Inches(2.3), bg_color=C_LIGHT_SURFACE, border_color=C_LIGHT_BORDER)
        tf_m = card.text_frame
        tf_m.margin_left = Inches(0.3); tf_m.margin_top = Inches(0.25)
        p1 = tf_m.paragraphs[0]
        r1 = p1.add_run(); r1.text = m_label
        apply_font(r1, font_name=FONT_FAMILY, size_pt=11, bold=True, color_rgb=C_TEXT_DARK_MUTED)
        
        p2 = tf_m.add_paragraph(); p2.space_before = Pt(4); p2.space_after = Pt(4)
        r2 = p2.add_run(); r2.text = m_num
        apply_font(r2, font_name=FONT_FAMILY, size_pt=28, bold=True, color_rgb=accent_c)

        p3 = tf_m.add_paragraph()
        r3 = p3.add_run(); r3.text = m_sub
        apply_font(r3, font_name=FONT_FAMILY, size_pt=9.5, color_rgb=C_TEXT_DARK_MUTED)

    # Lower Flow Container: Recovery Loop
    lower_card = add_card(s4, Inches(0.8), Inches(4.75), Inches(11.733), Inches(2.0), bg_color=C_LIGHT_SURFACE, border_color=C_LIGHT_BORDER)
    tf_low = lower_card.text_frame
    tf_low.margin_left = Inches(0.4); tf_low.margin_top = Inches(0.25)
    p_lh = tf_low.paragraphs[0]; p_lh.space_after = Pt(6)
    r_lh = p_lh.add_run(); r_lh.text = "■ 파트너 회신 반영 재최적화 루프 (Plan v1 → Plan v2)"
    apply_font(r_lh, font_name=FONT_FAMILY, size_pt=12, bold=True, color_rgb=C_TEXT_DARK)

    steps_text = [
        "1. 11:00 창고 A 수용량 20→8대 급감 접수 (12대 즉시 초과)",
        "2. CERA가 Plan v1 산출 및 부족 자원(ODCY A 슬롯, 운송사 트럭) 문의 초안 3건 즉시 생성",
        "3. 운영자 [발송 승인] 클릭 → 파트너 회신 도착 (ODCY A 4대 수용 확인, 운송사 트럭 2대 가용)",
        "4. 신규 제약 반영 실시간 재최적화 → Plan v2 최종 확정 (총 79.5만 원 손실 영구 방어)"
    ]
    for st in steps_text:
        p = tf_low.add_paragraph(); p.space_after = Pt(2)
        r = p.add_run(); r.text = st
        apply_font(r, font_name=FONT_FAMILY, size_pt=9.5, color_rgb=C_TEXT_DARK_MUTED)

    add_footer(s4, 4)

    # -------------------------------------------------------------------------
    # Slide 5: System Architecture & Engine Boundary
    # -------------------------------------------------------------------------
    s5 = prs.slides.add_slide(blank_slide_layout)
    add_header(s5, "ARCHITECTURE & TRUST", 
               "비용 계산과 최적화는 100% 결정론적 코드 — AI는 비정형 소통 보조에만 국한",
               "LLM의 환각(Hallucination) 위험을 원천 차단하기 위해 엄격한 책임 경계를 확립했습니다.")

    arch_blocks = [
        ("입력 수집 & 조율", "FastAPI / Event Store", "공공 API, 이메일, 엑셀 모든 입력을 불변 이벤트로 변환. 신뢰도 매트릭스에 따라 정본 운영 상태(Canonical State) 계산.", C_ACCENT_BLUE),
        ("결정론 엔진 (핵심)", "Python MIP Solver / Tariff Core", "D&D 요율 계산, 운송료 합산, 최적 배정 솔버는 LLM을 절대 참조하지 않는 순수 파이썬 수학 모델로 100% 재현 보장.", C_ACCENT_CYAN),
        ("비정형 AI 보조", "Gemini LLM Assistant", "파트너 회신 이메일 및 복잡한 계약서 원문 파싱, 정형 문의 초안 작성을 보조하며 서버 검증기를 통과해야만 이벤트로 승격.", C_ACCENT_AMBER),
        ("인간 승인 게이트", "Human-in-the-Loop", "외부 발송 및 복구 계획 확정은 운영자의 명시적 승인 없이 절대로 실행되지 않는 물리적 안전장치(Approval Gate) 탑재.", C_ACCENT_EMERALD)
    ]
    for idx, (b_title, b_sub, b_desc, acc_c) in enumerate(arch_blocks):
        cx = Inches(0.8 + idx * 2.95)
        card = add_card(s5, cx, Inches(2.2), Inches(2.8), Inches(4.5), bg_color=C_LIGHT_SURFACE, border_color=C_LIGHT_BORDER)
        
        strip = s5.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, Inches(2.2), Inches(2.8), Inches(0.08))
        strip.fill.solid(); strip.fill.fore_color.rgb = acc_c; strip.line.fill.background()

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25); tf.margin_right = Inches(0.25); tf.margin_top = Inches(0.35)
        
        p1 = tf.paragraphs[0]; p1.space_after = Pt(4)
        r1 = p1.add_run(); r1.text = b_title
        apply_font(r1, font_name=FONT_FAMILY, size_pt=13, bold=True, color_rgb=C_TEXT_DARK)
        
        p2 = tf.add_paragraph(); p2.space_after = Pt(12)
        r2 = p2.add_run(); r2.text = b_sub
        apply_font(r2, font_name=FONT_CODE, size_pt=9, bold=True, color_rgb=acc_c)

        p3 = tf.add_paragraph()
        r3 = p3.add_run(); r3.text = b_desc
        apply_font(r3, font_name=FONT_FAMILY, size_pt=9.5, color_rgb=C_TEXT_DARK_MUTED)

    add_footer(s5, 5)

    # -------------------------------------------------------------------------
    # Slide 6: Roadmap & Closing (Dark Theme)
    # -------------------------------------------------------------------------
    s6 = prs.slides.add_slide(blank_slide_layout)
    bg6 = s6.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg6.fill.solid(); bg6.fill.fore_color.rgb = C_DARK_BG; bg6.line.fill.background()

    add_header(s6, "ROADMAP & NEXT STEPS", 
               "Control Tower 프로토타입 검증 완료 — 다음 단계는 외부 통신 실증(Tech Validation)입니다.",
               "단계별 게이트(Gate)를 통해 기술적 리스크를 선제 해소하고 실제 화주 및 포워더 현장에 배포합니다.", dark_theme=True)

    phases = [
        ("Phase 0.5 (현재 완료)", "Control Tower 프로토타입", "• Next.js 웹 관제 콘솔 개발 완료\n• 부산항 30대 시나리오 실증 완료\n• 개념 데이터 모델(docs/21) 확립", C_ACCENT_CYAN),
        ("Phase 1.0 (다음 단계)", "Tech Validation", "• Gmail OAuth 외부 통신 연동\n• 등록/승인된 테스트 주소 실발송\n• 회신 파싱 및 재최적화 완주", C_ACCENT_BLUE),
        ("Phase 2.0 (상용 실증)", "Pilot 협력사 운영", "• 중견 포워더 1~2개사 실화물 관제\n• 실 B/L 50건 D&D 방어 실증\n• 선사 Tariff 파서 고도화", C_ACCENT_EMERALD),
        ("Phase 3.0 (본 서비스)", "Scale & Commercial", "• 대형 TMS 연동 OpenAPI 공개\n• 모바일 현장 확인 간편 앱 배포\n• 인천·광양 등 전국 항만 확장", C_TEXT_MUTED)
    ]
    for idx, (ph_title, ph_sub, ph_desc, ph_c) in enumerate(phases):
        cx = Inches(0.8 + idx * 2.95)
        card = add_card(s6, cx, Inches(2.2), Inches(2.8), Inches(4.3), bg_color=C_DARK_CARD, border_color=C_DARK_BORDER)
        
        strip = s6.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, Inches(2.2), Inches(2.8), Inches(0.08))
        strip.fill.solid(); strip.fill.fore_color.rgb = ph_c; strip.line.fill.background()

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25); tf.margin_right = Inches(0.25); tf.margin_top = Inches(0.3)
        
        p1 = tf.paragraphs[0]; p1.space_after = Pt(4)
        r1 = p1.add_run(); r1.text = ph_title
        apply_font(r1, font_name=FONT_FAMILY, size_pt=12, bold=True, color_rgb=C_TEXT_WHITE)
        
        p2 = tf.add_paragraph(); p2.space_after = Pt(10)
        r2 = p2.add_run(); r2.text = ph_sub
        apply_font(r2, font_name=FONT_FAMILY, size_pt=10, bold=True, color_rgb=ph_c)

        p3 = tf.add_paragraph()
        r3 = p3.add_run(); r3.text = ph_desc
        apply_font(r3, font_name=FONT_FAMILY, size_pt=9, color_rgb=C_TEXT_MUTED)

    add_footer(s6, 6, dark_theme=True)

    prs.save(output_pptx)
    print(f"Successfully generated modern pitch deck at {output_pptx}")

if __name__ == '__main__':
    out = r"C:\Users\PC\Desktop\workspace\container_exception\data\Proposal\CERA_PITCH_DECK.pptx"
    build_pitch_deck(out)
