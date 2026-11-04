import csv
import io
import posixpath
import re
import zipfile
from xml.etree import ElementTree

from rest_framework.exceptions import ValidationError


MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def _column_index(reference):
    match = re.match(r"([A-Z]+)", reference or "")
    if not match:
        raise ValueError("Invalid cell reference")
    result = 0
    for char in match.group(1):
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def _xlsx_rows(upload):
    try:
        with zipfile.ZipFile(upload) as archive:
            def xml(path):
                info = archive.getinfo(path)
                if info.file_size > 8 * 1024 * 1024:
                    raise ValueError("Worksheet is too large")
                return ElementTree.fromstring(archive.read(path))

            workbook = xml("xl/workbook.xml")
            sheet = workbook.find(f"{MAIN_SHEETS}sheet")
            if sheet is None:
                raise ValueError("Workbook has no sheets")
            relation_id = sheet.get(f"{{{REL}}}id")
            relationships = xml("xl/_rels/workbook.xml.rels")
            target = next((item.get("Target") for item in relationships.findall(f"{{{PKG_REL}}}Relationship") if item.get("Id") == relation_id), None)
            if not target:
                raise ValueError("Worksheet is missing")
            path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
            if not path.startswith("xl/"):
                raise ValueError("Invalid worksheet path")

            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                strings = xml("xl/sharedStrings.xml")
                for item in strings.findall(f"{{{MAIN}}}si"):
                    shared.append("".join(node.text or "" for node in item.iter(f"{{{MAIN}}}t")))

            worksheet = xml(path)
            rows = []
            for row in worksheet.findall(f".//{{{MAIN}}}sheetData/{{{MAIN}}}row"):
                values = {}
                for cell in row.findall(f"{{{MAIN}}}c"):
                    if cell.find(f"{{{MAIN}}}f") is not None:
                        raise ValueError("Formulas are not supported; paste values before importing")
                    value = cell.find(f"{{{MAIN}}}v")
                    if cell.get("t") == "inlineStr":
                        inline = cell.find(f"{{{MAIN}}}is")
                        text = "".join(node.text or "" for node in inline.iter(f"{{{MAIN}}}t")) if inline is not None else ""
                    elif cell.get("t") == "s" and value is not None:
                        text = shared[int(value.text)]
                    else:
                        text = value.text if value is not None and value.text is not None else ""
                    values[_column_index(cell.get("r"))] = text
                if values and any(str(value).strip() for value in values.values()):
                    rows.append((int(row.get("r", len(rows) + 1)), values))
                    if len(rows) > 501:
                        raise ValueError("Workbook must contain at most 500 products")
            if not rows:
                raise ValueError("Workbook is empty")
            header = rows[0][1]
            if len(set(header.values())) != len(header):
                raise ValueError("Column names must be unique")
            return list(header.values()), [
                (number, {name: str(values.get(index, "")) for index, name in header.items()})
                for number, values in rows[1:]
            ]
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError, ValueError, IndexError, TypeError) as exc:
        raise ValidationError({"file": f"Excel file could not be read: {exc}"}) from exc


MAIN_SHEETS = f"{{{MAIN}}}sheets/{{{MAIN}}}"


def read_product_rows(upload):
    name = upload.name.lower()
    if name.endswith(".xlsx"):
        headers, rows = _xlsx_rows(upload)
    elif name.endswith(".csv"):
        try:
            content = upload.read().decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(content))
            headers = reader.fieldnames or []
            rows = list(enumerate(reader, start=2))
        except (UnicodeDecodeError, csv.Error) as exc:
            raise ValidationError({"file": "CSV must be readable UTF-8."}) from exc
    else:
        raise ValidationError({"file": "Upload a .csv or .xlsx file."})

    required = {"name", "sku", "cost_price", "selling_price", "stock_quantity"}
    if not required.issubset(headers) or len(headers) != len(set(headers)) or any(not header for header in headers):
        raise ValidationError({"file": f"File must contain unique columns: {', '.join(sorted(required))}."})
    if not rows or len(rows) > 500:
        raise ValidationError({"file": "File must contain between 1 and 500 products."})
    return rows
