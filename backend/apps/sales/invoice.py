"""Small dependency-free PDF renderer for sales invoices."""

from textwrap import wrap


def _pdf_text(value):
    text = str(value).encode("latin-1", "replace").decode("latin-1")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def render_invoice_pdf(order):
    organization = order.organization
    customer = order.customer
    lines = [
        f"INVOICE  {order.order_number}",
        f"Status: {order.status}    Date: {order.created_at:%Y-%m-%d}",
        "",
        organization.name,
    ]
    for value in (organization.address, organization.email, organization.phone):
        if value:
            lines.extend(wrap(str(value), width=78) or [""])
    lines.extend(["", f"Bill to: {customer.name if customer else 'Walk-in customer'}"])
    if customer:
        for value in (customer.address, customer.email, customer.phone):
            if value:
                lines.extend(wrap(str(value), width=78) or [""])
    lines.extend(["", "Item                                      Qty     Unit price      Total", "-" * 78])
    for item in order.items.all():
        for index, part in enumerate(wrap(item.product.name, width=38) or [""]):
            if index == 0:
                lines.append(
                    f"{part[:38]:38} {item.quantity:>5} {item.unit_price:>14} {item.line_total:>12}"
                )
            else:
                lines.append(part)
    lines.extend([
        "-" * 78,
        f"Subtotal: {order.subtotal:.2f} {organization.currency}",
        f"Discount: {order.discount_amount:.2f} {organization.currency}",
        f"Tax: {order.tax_amount:.2f} {organization.currency}",
        f"Total: {order.total_amount:.2f} {organization.currency}",
    ])
    if order.notes:
        lines.extend(["", "Notes:"])
        lines.extend(wrap(order.notes, width=78))

    pages = [lines[index:index + 47] for index in range(0, len(lines), 47)]
    objects = [b"", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"]
    page_ids = []
    for page_lines in pages:
        page_id = len(objects) + 1
        stream_id = page_id + 1
        page_ids.append(page_id)
        commands = []
        for row, line in enumerate(page_lines):
            size = 15 if row == 0 and page_id == 4 else 9
            y = 790 - row * 15
            commands.append(
                f"BT /F1 {size} Tf 42 {y} Td ({_pdf_text(line)}) Tj ET"
            )
        stream = "\n".join(commands).encode("latin-1")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {stream_id} 0 R >>".encode("ascii")
        )
        objects.append(
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii")
            + stream + b"\nendstream"
        )
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode("ascii")

    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(result))
        result.extend(f"{number} 0 obj\n".encode("ascii"))
        result.extend(obj)
        result.extend(b"\nendobj\n")
    xref_offset = len(result)
    result.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    result.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    result.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(result)
