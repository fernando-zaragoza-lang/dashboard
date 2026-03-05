import csv
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

with open('C:\\Users\\Fer\\Desktop\\Dashboard_SAS\\Seguimiento cursos formacion 2025 - Nuevos.csv', encoding='utf-8', errors='ignore') as f:
    text = f.read()

lines = text.split('\n')
headers = None

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
            if len(y) != 4 or not y.isdigit() or not m.isdigit():
                print(f"INVALID FORMAT: '{dateStr}' -> Y: {y}, M: {m}")
        else:
            print(f"INVALID NO SLASH: '{dateStr}'")
