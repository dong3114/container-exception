"""
Convert CERA Proposal Markdown documents to beautifully styled DOCX and HTML/PDF.
"""
import os
import re
import sys
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
            <w:insideV w:val="none"/>
            <w:left w:val="none"/>
            <w:right w:val="none"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def markdown_to_docx(md_path, docx_path):
    print(f"Converting {md_path} to {docx_path}...")
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    doc = Document()

    # Page setup (A4, 20mm margins)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Base style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Malgun Gothic'
    style_normal.font.size = Pt(10)
    style_normal.font.color.rgb = RGBColor(31, 41, 55) # gray-800

    i = 0
    in_code_block = False
    code_block_lines = []
    in_table = False
    table_rows = []

    def flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            in_table = False
            return
        
        # Filter separator row (e.g. |---|---|)
        valid_rows = []
        for r in table_rows:
            if all(re.match(r'^:?-+:?$', c.strip()) for c in r if c.strip()):
                continue
            valid_rows.append(r)
            
        if not valid_rows:
            in_table = False
            table_rows = []
            return

        cols_count = max(len(r) for r in valid_rows)
        # Pad shorter rows
        for r in valid_rows:
            while len(r) < cols_count:
                r.append("")

        table = doc.add_table(rows=len(valid_rows), cols=cols_count)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(table)

        for row_idx, r in enumerate(valid_rows):
            is_header = (row_idx == 0)
            row = table.rows[row_idx]
            
            # CantSplit and tblHeader
            trPr = row._tr.get_or_add_trPr()
            trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
            if is_header:
                trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

            for col_idx, cell_value in enumerate(r):
                cell = row.cells[col_idx]
                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
                
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(3)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.15
                
                # Header formatting
                if is_header:
                    set_cell_background(cell, "F3F4F6") # gray-100
                    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(clean_md_text(cell_value))
                    run.font.name = 'Malgun Gothic'
                    run.font.size = Pt(9.5)
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(17, 24, 39)
                else:
                    if row_idx % 2 == 1:
                        set_cell_background(cell, "FFFFFF")
                    else:
                        set_cell_background(cell, "FAFAFA")
                    
                    # Parse bold inside cell
                    add_formatted_text(p, cell_value, default_size=9)

        doc.add_paragraph() # spacing after table
        in_table = False
        table_rows = []

    def clean_md_text(txt):
        txt = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', txt) # remove markdown links
        txt = txt.replace('**', '').replace('`', '').strip()
        return txt

    def add_formatted_text(para, text, default_size=10, is_bullet=False):
        # Handle inline formatting: **bold**, `code`, [link](url)
        # Clean links
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        
        # Tokenize by bold ** and code `
        tokens = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
        for token in tokens:
            if not token:
                continue
            if token.startswith('**') and token.endswith('**'):
                run = para.add_run(token[2:-2])
                run.font.name = 'Malgun Gothic'
                run.font.size = Pt(default_size)
                run.font.bold = True
                run.font.color.rgb = RGBColor(17, 24, 39)
            elif token.startswith('`') and token.endswith('`'):
                run = para.add_run(f" {token[1:-1]} ")
                run.font.name = 'Consolas'
                run.font.size = Pt(default_size * 0.9)
                run.font.color.rgb = RGBColor(185, 28, 28) # red-700
            else:
                run = para.add_run(token)
                run.font.name = 'Malgun Gothic'
                run.font.size = Pt(default_size)
                run.font.color.rgb = RGBColor(55, 65, 81)

    while i < len(lines):
        line = lines[i].rstrip('\r\n')

        # Code blocks
        if line.startswith('```'):
            if in_code_block:
                # Flush code block
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(6)
                p.paragraph_format.left_indent = Inches(0.2)
                p.paragraph_format.line_spacing = 1.05
                run = p.add_run("\n".join(code_block_lines))
                run.font.name = 'Consolas'
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(30, 41, 59)
                in_code_block = False
                code_block_lines = []
            else:
                if in_table:
                    flush_table()
                in_code_block = True
                code_block_lines = []
            i += 1
            continue

        if in_code_block:
            code_block_lines.append(line)
            i += 1
            continue

        # Tables (lines starting with |)
        if line.strip().startswith('|') and line.strip().endswith('|'):
            in_table = True
            cells = [c.strip() for c in line.strip()[1:-1].split('|')]
            table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            flush_table()

        # Empty lines
        if not line.strip():
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^-{3,}$', line.strip()):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(8)
            run = p.add_run("―" * 55)
            run.font.color.rgb = RGBColor(209, 213, 219)
            i += 1
            continue

        # Headings
        if line.startswith('# '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(18)
            p.paragraph_format.space_after = Pt(6)
            run = p.add_run(line[2:].strip())
            run.font.name = 'Malgun Gothic'
            run.font.size = Pt(18)
            run.font.bold = True
            run.font.color.rgb = RGBColor(15, 23, 42) # slate-900
            i += 1
            continue
        elif line.startswith('## '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(14)
            p.paragraph_format.space_after = Pt(4)
            run = p.add_run(line[3:].strip())
            run.font.name = 'Malgun Gothic'
            run.font.size = Pt(14)
            run.font.bold = True
            run.font.color.rgb = RGBColor(30, 58, 138) # blue-900
            i += 1
            continue
        elif line.startswith('### '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(3)
            run = p.add_run(line[4:].strip())
            run.font.name = 'Malgun Gothic'
            run.font.size = Pt(12)
            run.font.bold = True
            run.font.color.rgb = RGBColor(17, 24, 39)
            i += 1
            continue
        elif line.startswith('#### '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run(line[5:].strip())
            run.font.name = 'Malgun Gothic'
            run.font.size = Pt(10.5)
            run.font.bold = True
            run.font.color.rgb = RGBColor(55, 65, 81)
            i += 1
            continue

        # Blockquote (>)
        if line.startswith('> '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.left_indent = Inches(0.25)
            run_bar = p.add_run("▍ ")
            run_bar.font.color.rgb = RGBColor(59, 130, 246) # blue-500
            add_formatted_text(p, line[2:].strip(), default_size=9.5)
            i += 1
            continue

        # Lists (bullet / number)
        if re.match(r'^\s*[-*]\s+', line):
            indent_level = len(line) - len(line.lstrip())
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.left_indent = Inches(0.2 + 0.15 * (indent_level // 2))
            run_bullet = p.add_run("• ")
            run_bullet.font.bold = True
            run_bullet.font.color.rgb = RGBColor(79, 70, 229)
            content = re.sub(r'^\s*[-*]\s+', '', line)
            add_formatted_text(p, content, default_size=10, is_bullet=True)
            i += 1
            continue

        if re.match(r'^\s*\d+\.\s+', line):
            m = re.match(r'^\s*(\d+\.)\s+(.*)', line)
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.left_indent = Inches(0.25)
            run_num = p.add_run(f"{m.group(1)} ")
            run_num.font.bold = True
            add_formatted_text(p, m.group(2), default_size=10)
            i += 1
            continue

        # Standard paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.2
        add_formatted_text(p, line, default_size=10)
        i += 1

    if in_table:
        flush_table()

    doc.save(docx_path)
    print(f"Successfully saved {docx_path}")

if __name__ == '__main__':
    base_dir = r"C:\Users\PC\Desktop\workspace\container_exception\data\Proposal"
    files = [
        "01_PROJECT_PROPOSAL",
        "02_REQUIREMENTS_SPECIFICATION",
        "03_UI_SCREEN_SPECIFICATION",
        "04_TABLE_DEFINITION_SPECIFICATION",
        "README"
    ]
    for f in files:
        md = os.path.join(base_dir, f"{f}.md")
        out = os.path.join(base_dir, f"{f}.docx")
        if os.path.exists(md):
            markdown_to_docx(md, out)
