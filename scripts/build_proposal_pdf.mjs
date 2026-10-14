import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const proposalDir = resolve("data/Proposal");
const files = [
  "01_PROJECT_PROPOSAL",
  "02_REQUIREMENTS_SPECIFICATION",
  "03_UI_SCREEN_SPECIFICATION",
  "04_TABLE_DEFINITION_SPECIFICATION",
  "README"
];

// 1. Generate HTML files using python markdown
execSync('python -c "import os, markdown\nbase = r\\"data/Proposal\\"\nfor name in [\\"01_PROJECT_PROPOSAL\\", \\"02_REQUIREMENTS_SPECIFICATION\\", \\"03_UI_SCREEN_SPECIFICATION\\", \\"04_TABLE_DEFINITION_SPECIFICATION\\", \\"README\\"]:\n    md_path = os.path.join(base, f\\"{name}.md\\")\n    html_path = os.path.join(base, f\\"{name}.html\\")\n    with open(md_path, encoding=\\"utf-8\\") as f:\n        text = f.read()\n    html_body = markdown.markdown(text, extensions=[\\"tables\\", \\"fenced_code\\"])\n    full_html = f\'\'\'<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"><title>{name}</title></head><body>{html_body}</body></html>\'\'\'\n    with open(html_path, \\"w\\", encoding=\\"utf-8\\") as out:\n        out.write(full_html)\n"', { stdio: "inherit" });

console.log("HTML files generated. Launching Edge browser via playwright-core for PDF printing...");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();

const css = `
@page {
  size: A4;
  margin: 18mm 15mm 20mm 15mm;
  @bottom-right {
    content: counter(page);
  }
}
body {
  font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1f2937;
  line-height: 1.6;
  font-size: 10pt;
}
h1 {
  font-size: 20pt;
  font-weight: 800;
  color: #0f172a;
  border-bottom: 2px solid #3b82f6;
  padding-bottom: 8px;
  margin-top: 0;
  margin-bottom: 16px;
}
h2 {
  font-size: 14pt;
  font-weight: 700;
  color: #1e3a8a;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
  margin-top: 24px;
  margin-bottom: 12px;
  page-break-after: avoid;
}
h3 {
  font-size: 11.5pt;
  font-weight: 700;
  color: #111827;
  margin-top: 18px;
  margin-bottom: 8px;
  page-break-after: avoid;
}
h4 {
  font-size: 10pt;
  font-weight: 700;
  color: #374151;
  margin-top: 14px;
  margin-bottom: 6px;
  page-break-after: avoid;
}
p {
  margin-top: 4px;
  margin-bottom: 8px;
}
blockquote {
  border-left: 4px solid #3b82f6;
  background-color: #f8fafc;
  margin: 10px 0;
  padding: 8px 14px;
  color: #334155;
  font-size: 9.5pt;
}
blockquote p {
  margin: 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 8.5pt;
  page-break-inside: auto;
}
tr {
  page-break-inside: avoid;
  page-break-after: auto;
}
th {
  background-color: #f1f5f9;
  color: #0f172a;
  font-weight: 700;
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  text-align: center;
}
td {
  border: 1px solid #e2e8f0;
  padding: 5px 8px;
  vertical-align: middle;
}
tbody tr:nth-child(even) {
  background-color: #f8fafc;
}
pre {
  background-color: #0f172a;
  color: #f8fafc;
  padding: 10px 14px;
  border-radius: 6px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 8pt;
  overflow-x: auto;
  margin: 10px 0;
  page-break-inside: avoid;
}
code {
  font-family: 'Consolas', 'Courier New', monospace;
  background-color: #f1f5f9;
  color: #b91c1c;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 8.5pt;
}
pre code {
  background-color: transparent;
  color: inherit;
  padding: 0;
}
ul, ol {
  margin: 6px 0;
  padding-left: 20px;
}
li {
  margin-bottom: 4px;
}
hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 20px 0;
}
`;

for (const name of files) {
  const htmlPath = join(proposalDir, `${name}.html`);
  const pdfPath = join(proposalDir, `${name}.pdf`);
  console.log(`Printing ${name}.pdf...`);
  
  let html = readFileSync(htmlPath, "utf-8");
  html = html.replace("</head>", `<style>${css}</style></head>`);
  
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    margin: { top: "18mm", bottom: "20mm", left: "15mm", right: "15mm" },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size: 7.5pt; color: #94a3b8; width: 100%; text-align: right; padding-right: 15mm; font-family: sans-serif;">CERA Project Proposal & System Specification | ${name}</div>`,
    footerTemplate: `<div style="font-size: 7.5pt; color: #94a3b8; width: 100%; text-align: center; font-family: sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`
  });
  console.log(`  ✓ Successfully saved ${pdfPath}`);
}

await browser.close();
console.log("All PDF documents generated successfully!");
