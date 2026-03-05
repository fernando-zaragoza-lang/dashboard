import csv
import re
from datetime import datetime

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
mar_sum1 = 0
mar_sum2 = 0
mar_vals = []

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
            
        dateStr1 = rowObj.get('Marca temporal', '') # Use Timestamp instead!
        dateStr2 = rowObj.get('Fecha de compra', '') 
        
        # Check Marca temporal
        m_mar1 = False
        parts1 = dateStr1.split('/')
        if len(parts1) >= 2 and parts1[1].zfill(2) == '03':
            m_mar1 = True
            
        # Check Fecha de compra
        m_mar2 = False
        parts2 = dateStr2.split('/')
        if len(parts2) >= 2 and parts2[1].zfill(2) == '03':
            m_mar2 = True

        valStr = rowObj.get('Valor de compra TOTAL (independientemente de que pague mensual)', '').replace('"', '')
        if not valStr or valStr.strip() == '' or valStr.strip() == '0,00 €':
            valStr = rowObj.get('Ticket total', '').replace('"', '')
        
        val = parseEuroValue(valStr)
        
        if m_mar1 and val > 0:
            mar_sum1 += val
            print(f"MAR Timestamp: {rowObj.get('Nombre completo')} | val={val} | date={dateStr1}")
            
        if m_mar2 and val > 0:
            mar_sum2 += val
            # already printed in previous script

print("MARCH SUM BY TIMESTAMP (Marca temporal):", mar_sum1)
print("MARCH SUM BY DATE (Fecha de compra):", mar_sum2)
