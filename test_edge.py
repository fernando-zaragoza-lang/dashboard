import re

def parseCSVLine(line):
    result = []
    cur = ''
    inQuote = False
    for char in line:
        if char == '"':
            inQuote = not inQuote
        elif char == ',' and not inQuote:
            result.append(cur)
            cur = ''
        else:
            cur += char
    result.append(cur)
    return result

def parseEuroValue(valStr):
    if not valStr: return 0
    clean = str(valStr).replace('€', '').replace('.', '').replace(',', '.').strip()
    try:
        clean2 = re.match(r"^[-+]?\d*\.?\d*", clean).group(0)
        return float(clean2)
    except:
        return 0

with open('C:\\Users\\Fer\\Desktop\\Dashboard_SAS\\Seguimiento cursos formacion 2025 - Nuevos.csv', encoding='utf-8', errors='ignore') as f:
    text = f.read()

lines = text.split('\n')
headers = None
mar_sum = 0
feb_sum = 0
for line in lines:
    if not line.strip(): continue
    row = parseCSVLine(line)
    if not headers:
        if any('Marca temporal' in c for c in row) or any('Valor de compra TOTAL' in c for c in row):
            headers = [c.strip() for c in row]
    else:
        rowObj = {}
        for j in range(len(headers)):
            headerName = headers[j] if headers[j] else f"Columna_Extra_{j}"
            rowObj[headerName] = row[j] if j < len(row) else ""
            
        dateStr = rowObj.get('Marca temporal', '')
        if not dateStr.strip(): continue
        parts = dateStr.split('/')
        if len(parts) >= 2:
            m = str(parts[1]).zfill(2)
            yRaw = parts[2] if len(parts) == 3 else '2025'
            y = yRaw.split(' ')[0]
            monthKey = f"{y}-{m}"
            
            valStr = rowObj.get('Valor de compra TOTAL (independientemente de que pague mensual)', '').replace('"', '')
            if not valStr or valStr.strip() == '' or valStr.strip() == '0,00 €' or valStr.strip() == "0,00 '":
                valStr = rowObj.get('Ticket total', '').replace('"', '')
            
            val = parseEuroValue(valStr)
            
            if monthKey == '2026-03':
                mar_sum += val
                if val > 0:
                    print(f"MAR ROW (Total): {rowObj.get('Nombre completo')} | Val = {val} | Full date: {dateStr}")
            if monthKey == '2026-02':
                feb_sum += val
                if val > 0 and 10 < val < 20:
                     print(f"FEB ROW (Total): {rowObj.get('Nombre completo')} | Val = {val} | Full date: {dateStr}")

print("TOTAL MAR:", mar_sum)
print("TOTAL FEB:", feb_sum)
