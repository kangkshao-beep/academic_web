from pathlib import Path
import re

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


OUTPUT = Path(__file__).resolve().parents[1] / "public/notes/quantum-field-theory/2026.0827.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
FONT = "Songti"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/Songti.ttc")
ACCENT = HexColor("#B65A3C")
INK = HexColor("#1F2937")
MUTED = HexColor("#6B7280")
PAPER = HexColor("#FFF8F2")


def split_lines(text: str, max_width: float, font_size: float) -> list[str]:
    """Wrap mixed Chinese and English text without rasterizing any characters."""
    tokens = re.findall(r"[A-Za-z0-9_./=+*^(){}\\-]+|\s+|[^A-Za-z0-9_./=+*^(){}\\-]", text)
    lines: list[str] = []
    current = ""

    for token in tokens:
        candidate = current + token
        if current and pdfmetrics.stringWidth(candidate, FONT, font_size) > max_width:
            lines.append(current.rstrip())
            current = token.lstrip()
        else:
            current = candidate

    if current.strip():
        lines.append(current.rstrip())
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, *, size: float = 10.5,
                 color=INK, leading: float | None = None) -> float:
    leading = leading or size * 1.62
    c.setFont(FONT, size)
    c.setFillColor(color)
    for line in split_lines(text, width, size):
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_rule(c: canvas.Canvas, y: float) -> None:
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.setLineWidth(0.7)
    c.line(54, y, PAGE_WIDTH - 54, y)


def draw_header(c: canvas.Canvas, page: int) -> None:
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_HEIGHT - 18, PAGE_WIDTH, 18, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(54, PAGE_HEIGHT - 38, "QUANTUM FIELD THEORY / SEARCH SAMPLE")
    c.drawRightString(PAGE_WIDTH - 54, PAGE_HEIGHT - 38, "2026.0827")
    draw_rule(c, PAGE_HEIGHT - 48)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawString(54, 34, "Temporary retrieval sample - replaceable by formal course notes")
    c.drawRightString(PAGE_WIDTH - 54, 34, f"{page} / 2")


def draw_section(c: canvas.Canvas, number: str, title: str, y: float) -> float:
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(54, y, number)
    c.setFillColor(INK)
    c.setFont(FONT, 16)
    c.drawString(84, y - 2, title)
    return y - 30


def draw_formula(c: canvas.Canvas, formula: str, y: float) -> float:
    c.setFillColor(PAPER)
    c.roundRect(54, y - 39, PAGE_WIDTH - 108, 38, 3, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Courier", 10.5)
    c.drawCentredString(PAGE_WIDTH / 2, y - 25, formula)
    return y - 55


def make_pdf() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH), subfontIndex=2))
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("量子场论第 0 版检索测试笔记")
    c.setAuthor("Kang-Kang Shao")
    c.setSubject("Temporary searchable PDF sample for the Theory Notes section")
    c.setKeywords("quantum field theory, charm quark mass, 粲夸克质量, m_c")

    # Page 1
    draw_header(c, 1)
    c.bookmarkPage("cover")
    c.addOutlineEntry("量子场论第 0 版检索测试笔记", "cover", 0, False)
    c.setFillColor(INK)
    c.setFont(FONT, 24)
    c.drawString(54, 742, "量子场论第 0 版检索测试笔记")
    c.setFillColor(MUTED)
    c.setFont(FONT, 11)
    c.drawString(54, 716, "临时搜索样本 / 可被后续正式学习笔记覆盖或删除")

    c.setFillColor(PAPER)
    c.roundRect(54, 650, PAGE_WIDTH - 108, 46, 3, fill=1, stroke=0)
    note_y = draw_wrapped(
        c,
        "本文件用于验证网站的 PDF 全文检索、章节识别和页码跳转。它不提供实验数值、文献结论或研究结果。",
        68,
        681,
        PAGE_WIDTH - 136,
        size=10,
        color=INK,
        leading=15,
    )

    y = min(note_y - 18, 620)
    c.bookmarkPage("real-scalar")
    c.addOutlineEntry("自由实标量场", "real-scalar", 1, False)
    y = draw_section(c, "01", "自由实标量场", y)
    y = draw_wrapped(
        c,
        "以一个实标量场 phi 为例，自由理论可由二次拉格朗日量组织。这里的表达只用于说明场、质量参数和运动方程之间的基本记号关系。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    y -= 5
    y = draw_formula(c, "L = 1/2 (partial_mu phi)(partial^mu phi) - 1/2 m^2 phi^2", y)
    y = draw_wrapped(
        c,
        "通过平面波展开，场的量子化把连续的经典自由度重写为产生与湮灭算符。第 0 版只保留这一阅读路线，不尝试替代系统的推导。",
        54,
        y,
        PAGE_WIDTH - 108,
    )

    y -= 16
    c.bookmarkPage("dirac-field")
    c.addOutlineEntry("Dirac 场", "dirac-field", 1, False)
    y = draw_section(c, "02", "Dirac 场", y)
    y = draw_wrapped(
        c,
        "Dirac 场 psi 用来描述自旋 1/2 的费米子自由度。与实标量场相比，它的分量具有反对易结构；这一点决定了量子化时采用费米子算符代数。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    y -= 4
    y = draw_formula(c, "L = psi_bar ( i gamma^mu partial_mu - m ) psi", y)
    draw_wrapped(
        c,
        "这一页的关键词包括：自由实标量场、Dirac 场、量子化与费米子。它们均可作为网站搜索结果中的章节定位测试。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    c.showPage()

    # Page 2
    draw_header(c, 2)
    c.bookmarkPage("fermion-mass")
    c.addOutlineEntry("费米子质量项", "fermion-mass", 1, False)
    y = 742
    y = draw_section(c, "03", "费米子质量项", y)
    y = draw_wrapped(
        c,
        "在自由 Dirac 理论中，费米子质量项常写作 -m psi_bar psi。这个符号结构在不同的场论记号中会有排版差异，但本测试笔记只关心文本可检索性，而不对任何质量参数给出数值。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    y -= 5
    y = draw_formula(c, "fermion mass term:  - m psi_bar psi", y)
    y = draw_wrapped(
        c,
        "当讨论 charm quark mass 时，通常需要先明确质量方案、能标和所采用的理论框架。本文件不陈述 charm quark mass 的具体取值，也不比较任何实验或计算结果。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    y -= 12
    y = draw_wrapped(
        c,
        "中文检索词“粲夸克质量”在这里仅用作术语匹配样本；符号 m_c 也作为独立的检索入口出现。使用这些词搜索时，结果应显示本页及“费米子质量项”这一章节。",
        54,
        y,
        PAGE_WIDTH - 108,
    )

    y -= 18
    c.bookmarkPage("search-examples")
    c.addOutlineEntry("搜索验证词", "search-examples", 1, False)
    y = draw_section(c, "04", "搜索验证词", y)
    c.setFillColor(PAPER)
    c.roundRect(54, y - 122, PAGE_WIDTH - 108, 112, 3, fill=1, stroke=0)
    examples = [
        "英文短语：charm quark mass",
        "简体术语：粲夸克质量",
        "繁體術語：粲夸克質量",
        "符号：m_c",
        "通用字段：自由实标量场；Dirac 场；费米子质量项",
    ]
    current_y = y - 30
    c.setFont(FONT, 10.5)
    c.setFillColor(INK)
    for example in examples:
        c.drawString(70, current_y, example)
        current_y -= 19

    y = y - 150
    y = draw_wrapped(
        c,
        "维护说明：当正式 PDF 学习笔记加入 public/notes/ 并在课程时间线中登记后，部署构建会自动更新搜索索引。扫描件或不能复制文字的 PDF 会被跳过，不会阻塞发布。",
        54,
        y,
        PAGE_WIDTH - 108,
    )
    y -= 10
    c.setFillColor(MUTED)
    c.setFont(FONT, 10)
    c.drawString(54, y, "结束：本样本专用于搜索功能验证。")
    c.save()


if __name__ == "__main__":
    make_pdf()
