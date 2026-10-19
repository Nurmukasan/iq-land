"""Render the real launch-test workbook with LibreOffice; never alter its cells.

Usage after node tests/launch-browser.mjs:
    python tests/render-launch-workbook.py

Requires LibreOffice, Poppler (pdftoppm/pdftotext), and Pillow. The screenshots
are labelled crops from Calc's actual PDF export, not recreated HTML tables.
The full PDF and unmodified XLSX retain every row of all three sheets.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont


artifacts = Path(sys.argv[1] if len(sys.argv) > 1 else "../artifacts/iq-land-launch").resolve()
workbook = artifacts / "IQ-LAND-252-TEST.xlsx"
if not workbook.exists():
    raise SystemExit("Run node tests/launch-browser.mjs first: workbook not found")

with TemporaryDirectory(prefix="iqland-launch-calc-") as temp:
    env = {**os.environ, "XDG_CACHE_HOME": str(Path(temp) / "cache")}
    options = json.dumps({"SinglePageSheets": {"type": "boolean", "value": "true"}})
    result = subprocess.run(
        ["soffice", f"-env:UserInstallation={Path(temp).as_uri()}/profile", "--headless",
         "--convert-to", f"pdf:calc_pdf_Export:{options}", "--outdir", str(artifacts), str(workbook)],
        env=env, text=True, capture_output=True, timeout=300, check=True,
    )
    print(result.stdout.strip())

pdf = workbook.with_suffix(".pdf")
if not pdf.exists():
    raise SystemExit("LibreOffice did not produce the PDF")
text = subprocess.run(["pdftotext", str(pdf), "-"], text=True, capture_output=True, check=True).stdout
if "Тестовый Участник 252" not in text:
    raise SystemExit("Rendered PDF is missing the last synthetic participant")

font_root = Path("/usr/share/fonts/truetype/dejavu")
font = ImageFont.truetype(str(font_root / "DejaVuSans.ttf"), 21)
bold = ImageFont.truetype(str(font_root / "DejaVuSans-Bold.ttf"), 26)
for page, slug, title, count, width in [
    (1, "participants", "Участники", "252 ученика, включая 42 отменённых — со статусами", 2200),
    (2, "protocol", "Протокол", "420 участий в дисциплинах · 210 активных учеников", 1600),
    (3, "teachers", "Учителя", "36 педагогов, включая 6 в отменённых заявках", 1900),
]:
    full = artifacts / f"excel-{slug}-full"
    subprocess.run(
        ["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-scale-to-x", str(width),
         "-scale-to-y", "-1", "-png", str(pdf), str(full)],
        text=True, capture_output=True, timeout=120, check=True,
    )
    rendered = Image.open(full.with_suffix(".png")).convert("RGB")
    height = min(rendered.height, 1200)
    preview = Image.new("RGB", (width, height + 170), "white")
    draw = ImageDraw.Draw(preview)
    draw.rectangle((0, 0, width, 110), fill="#192851")
    draw.text((28, 18), f"IQ LAND · ТЕСТОВЫЕ ДАННЫЕ · {title}", font=bold, fill="white")
    draw.text((28, 62), count, font=font, fill="#d7ef75")
    preview.paste(rendered.crop((0, 0, width, height)), (0, 110))
    draw.text((28, height + 128), "Первые строки реального XLSX · отрисовано LibreOffice Calc · все строки в XLSX и PDF", font=font, fill="#192851")
    preview.save(artifacts / f"excel-{slug}.png", optimize=True)
    print(f"Rendered {title}: {rendered.width}×{rendered.height}; preview {preview.width}×{preview.height}")

(artifacts / "README.md").write_text(
    "# IQ LAND: проверка перед запуском\n\n"
    "Все имена, центры, контакты, мероприятия и приглашения Telegram вымышлены. "
    "Тест запускался с отдельной временной базой в облачной среде; рабочий сайт и его данные не менялись.\n\n"
    "В главной олимпиаде отправлено 12 заявок по 21 ученику: 252 ученика и 504 участия в дисциплинах. "
    "Две команды отменены: в активном протоколе 210 учеников, 420 участий; 378 результатов с баллами, "
    "42 без баллов. В том числе 21 нулевой результат. Равные баллы получают места 1, 1, 3.\n\n"
    "IQ-LAND-252-TEST.xlsx — исходный файл, скачанный кнопкой «Скачать Excel», без изменения ячеек или оформления. "
    "Листы: «Участники» — 252 строки, «Протокол» — 420, «Учителя» — 36. Заголовок в эти числа не входит. "
    "Отменённые ученики и педагоги сохраняются на листах со статусом, но исключены из протокола.\n\n"
    "IQ-LAND-252-TEST.pdf — все три листа, отрисованные LibreOffice Calc. "
    "excel-*.png — первые строки соответствующего листа с отдельной меткой тестовых данных. "
    "excel-*-full.png — рендеры всех строк без обрезки. Это изображения реального файла, а не макеты таблиц.\n\n"
    "qa-report.json содержит точные количества и выполненные проверки.\n",
    encoding="utf-8",
)
print(f"Artifacts saved in {artifacts}")
