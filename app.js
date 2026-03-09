// --- Constants & Global State ---
const SUPABASE_URL = 'https://vbbirpbauowtipmugayq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-d2OZVqMzbK_1uZ1sw6JAA_Q2nLMJX9';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const FILES = {
    nuevos: null,
    metodo: null
};

const STATE = {
    rawNuevosData: [],
    selectedYear: 'all',
    selectedMonth: 'all',
    selectedVendor: 'none',
    selectedCycle: 'all',
    salesByMonth: {},
    salesBySeller: {},
    unitsByProduct: {},
    activeStudents: [],
    renewalsYes: 0,
    renewalsNo: 0,
    totalSales: 0,
    totalUnits: 0,
    processedCount: 0,
    leadsLoaded: false,
    rawLeadsData: [],
    currentUserEmail: '',
    currentUserDisplay: ''
};

// Chart Instances (to destroy/recreate if needed)
let charts = {
    salesByMonth: null,
    salesBySeller: null,
    unitsByProduct: null
};

// Colors for charts harmonized with logo
const chartColors = [
    '#9b7bf7', '#e2b464', '#2dd4bf', '#ec4899', '#f59e0b',
    '#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#14b8a6'
];

const chartGradients = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check Authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    STATE.currentUserEmail = session.user.email;
    const namePart = session.user.email.split('@')[0].split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    STATE.currentUserDisplay = namePart;

    const emailDisplay = document.getElementById('user-email-display');
    if (emailDisplay) emailDisplay.textContent = STATE.currentUserDisplay;

    initNavigation();
    initMonthFilter();
    initVendorFilters();

    // Fetch data from Supabase on load
    fetchSupabaseData();
});

// --- UI Navigation & Interaction ---
function initMonthFilter() {
    const yearSelect = document.getElementById('yearFilter');
    if (yearSelect) {
        yearSelect.addEventListener('change', (e) => {
            STATE.selectedYear = e.target.value;
            if (STATE.rawNuevosData.length > 0) {
                aggregateNuevosData(STATE.rawNuevosData);
                updateDashboardUI();
            }
        });
    }

    const monthSelect = document.getElementById('monthFilter');
    if (monthSelect) {
        monthSelect.addEventListener('change', (e) => {
            STATE.selectedMonth = e.target.value;
            if (STATE.rawNuevosData.length > 0) {
                aggregateNuevosData(STATE.rawNuevosData);
                updateDashboardUI();
            }
        });
    }
}

function initVendorFilters() {
    const vendorSelect = document.getElementById('vendorFilter');
    const cycleSelect = document.getElementById('cycleFilter');

    if (vendorSelect) {
        vendorSelect.addEventListener('change', (e) => {
            STATE.selectedVendor = e.target.value;
            if (STATE.rawNuevosData.length > 0) updateVendorUI();
        });
    }
    if (cycleSelect) {
        cycleSelect.addEventListener('change', (e) => {
            STATE.selectedCycle = e.target.value;
            if (STATE.rawNuevosData.length > 0) updateVendorUI();
        });
    }
}

function initNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const navVendors = document.getElementById('nav-vendors');
    const navPublicity = document.getElementById('nav-publicity');
    const navRegistro = document.getElementById('nav-registro');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewVendors = document.getElementById('view-vendors');
    const viewPublicity = document.getElementById('view-publicity');
    const viewRegistro = document.getElementById('view-registro');

    // Helper: hide all views & deactivate all nav links
    function showView(activeView, activeNav) {
        [viewDashboard, viewVendors, viewPublicity, viewRegistro].forEach(v => {
            if (!v) return;
            v.classList.add('hidden');
            v.classList.remove('active');
        });
        [navDashboard, navVendors, navPublicity, navRegistro].forEach(n => {
            if (!n) return;
            n.parentElement.classList.remove('active');
        });
        if (activeView) { activeView.classList.remove('hidden'); activeView.classList.add('active'); }
        if (activeNav) { activeNav.parentElement.classList.add('active'); }
    }

    if (navDashboard) {
        navDashboard.addEventListener('click', (e) => {
            e.preventDefault();
            showView(viewDashboard, navDashboard);
        });
    }

    if (navVendors) {
        navVendors.addEventListener('click', (e) => {
            e.preventDefault();
            showView(viewVendors, navVendors);
            if (STATE.rawNuevosData && STATE.rawNuevosData.length > 0) updateVendorUI();
        });
    }

    if (navPublicity) {
        navPublicity.addEventListener('click', (e) => {
            e.preventDefault();
            showView(viewPublicity, navPublicity);
            // Load leads when the tab is first opened
            if (!STATE.leadsLoaded) fetchAndRenderAttribution();
        });
    }

    if (navRegistro) {
        navRegistro.addEventListener('click', (e) => {
            e.preventDefault();
            showView(viewRegistro, navRegistro);
            // Fetch logs when entering tab
            if (typeof fetchLogs === 'function') fetchLogs();
        });
    }

    // Logout listener
    const navLogout = document.getElementById('nav-logout');
    if (navLogout) {
        navLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            localStorage.removeItem('sas_auth');
            window.location.href = 'login.html';
        });
    }

    // Sync Data listener
    const btnSync = document.getElementById('btn-sync');
    if (btnSync) {
        btnSync.addEventListener('click', () => {
            const originalText = btnSync.innerHTML;
            btnSync.innerHTML = '<i>🔄</i> Sincronizando...';

            // Fetch new data
            fetchSupabaseData().finally(() => {
                btnSync.innerHTML = originalText;
            });
        });
    }

    // New Sale Modal Logic
    const btnAddSale = document.getElementById('btn-add-sale');
    const modalSale = document.getElementById('new-sale-modal');
    const btnCloseSale = document.getElementById('btn-close-sale');
    const formSale = document.getElementById('new-sale-form');

    if (btnAddSale && modalSale) {
        btnAddSale.addEventListener('click', () => {
            // Setup for explicit NEW sale
            document.getElementById('edit-sale-id').value = '';
            document.getElementById('modal-sale-title').textContent = 'Registrar Nueva Operación';
            document.getElementById('btn-submit-sale').textContent = 'Guardar Operación';
            formSale.reset();

            // Set default datetime to now
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('sale-date').value = now.toISOString().slice(0, 16);
            modalSale.classList.remove('hidden');
            document.body.classList.add('modal-open');
        });

        btnCloseSale.addEventListener('click', () => {
            modalSale.classList.add('hidden');
            document.body.classList.remove('modal-open');
        });

        // Close when clicking outside
        modalSale.addEventListener('click', (e) => {
            if (e.target === modalSale) {
                modalSale.classList.add('hidden');
                document.body.classList.remove('modal-open');
            }
        });

        // Submit new sale to Supabase
        formSale.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = document.getElementById('btn-submit-sale');
            const originalText = btnSubmit.textContent;
            btnSubmit.textContent = 'Guardando...';
            btnSubmit.disabled = true;

            // Gather data
            const dateVal = document.getElementById('sale-date').value;
            const vendorVal = document.getElementById('sale-vendor').value;
            const clientVal = document.getElementById('sale-client').value;

            // Gather checked products
            const checkedProducts = Array.from(document.querySelectorAll('input[name="product-option"]:checked')).map(cb => cb.value);
            const productVal = checkedProducts.join(', ');

            const amountVal = document.getElementById('sale-amount').value;
            const renewalVal = document.getElementById('sale-renewal').value;
            const countryVal = document.getElementById('sale-country').value;
            const languageVal = document.getElementById('sale-language') ? document.getElementById('sale-language').value : '';
            const paymentVal = document.getElementById('sale-payment-method').value;
            const promiseVal = document.getElementById('sale-promise').value;

            // Format datetime — guard against empty/invalid date
            let d = new Date(dateVal);
            if (!dateVal || isNaN(d.getTime())) d = new Date(); // fallback to now
            const formattedDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:00`;

            // Format to Euro string (e.g. 15,00 €)
            const formattedAmount = `${parseFloat(amountVal).toFixed(2).replace('.', ',')} €`;

            const emailVal = (document.getElementById('sale-email') || {}).value || '';
            const editId = document.getElementById('edit-sale-id').value;

            try {
                if (editId) {
                    // Build explicit update payload using exact Supabase column names
                    const updatePayload = {
                        'Marca temporal': formattedDate,
                        'Vendedor': vendorVal,
                        'Nombre completo': clientVal,
                        'Email': emailVal.trim().toLowerCase(),
                        'Qué compra?': productVal,
                        'Valor de compra TOTAL (independientemente de que pague mensual)': formattedAmount,
                        'Es una renovación?': renewalVal,
                        'En qué país vive?': countryVal,
                        'Idioma': languageVal,
                        'Forma de pago': paymentVal,
                        'Qué se le promete al cliente': promiseVal
                    };

                    console.log('UPDATE payload:', updatePayload);

                    const { error } = await supabaseClient
                        .from('ventas')
                        .update(updatePayload)
                        .eq('id', editId);

                    if (error) {
                        console.error('Supabase UPDATE Error:', error);
                        throw new Error(`Update falló: ${error.message || error.details || JSON.stringify(error)}`);
                    }

                    // Log the edit
                    const oldRow = STATE.rawNuevosData.find(r => String(r.id) === String(editId)) || {};
                    await supabaseClient.from('ventas_logs').insert([{
                        venta_id: editId.toString(),
                        usuario_editor: STATE.currentUserDisplay || STATE.currentUserEmail,
                        datos_anteriores: oldRow,
                        datos_nuevos: updatePayload
                    }]);
                    alert('Operación actualizada correctamente.');

                } else {
                    // Inserting new sale - use exact DB column names
                    const newRowData = {
                        'Marca temporal': formattedDate,
                        'Vendedor': vendorVal,
                        'Nombre completo': clientVal,
                        'Email': emailVal.trim().toLowerCase(),
                        'Qué compra?': productVal,
                        'Valor de compra TOTAL (independientemente de que pague mensual)': formattedAmount,
                        'Es una renovación?': renewalVal,
                        'En qué país vive?': countryVal,
                        'Idioma': languageVal,
                        'Forma de pago': paymentVal,
                        'Qué se le promete al cliente': promiseVal
                    };

                    console.log("Attempting to INSERT with payload:", newRowData);

                    const { error } = await supabaseClient
                        .from('ventas')
                        .insert([newRowData]);
                    if (error) {
                        console.error('Supabase INSERT Error Object:', error);
                        throw new Error(`Insert falló: ${error.message || error.details}`);
                    }
                    alert('Operación guardada correctamente.');
                }

                modalSale.classList.add('hidden');
                document.body.classList.remove('modal-open');
                formSale.reset();
                document.getElementById('edit-sale-id').value = '';

                // Refetch without blocking (async call but not awaited here to avoid UI hang)
                fetchSupabaseData();
            } catch (err) {
                console.error('--- DETAILED ERROR LOG ---');
                console.error('Context:', editId ? `Edición ID ${editId}` : 'Nueva Inserción');
                console.error('Error Object:', err);
                alert(`Error al guardar: ${err.message || 'Consulta la consola para más detalles.'}`);
            } finally {
                btnSubmit.textContent = originalText;
                btnSubmit.disabled = false;
            }
        });
    }
} // end initNavigation

// --- Modal Edit Helper ---
window.openEditModal = function (id) {
    console.log('=== openEditModal llamado con id:', id, 'tipo:', typeof id);
    console.log('STATE.rawNuevosData tiene', STATE.rawNuevosData.length, 'filas');
    if (STATE.rawNuevosData.length > 0) {
        const sample = STATE.rawNuevosData.slice(0, 3).map(r => ({ id: r.id, tipo: typeof r.id }));
        console.log('Muestra de IDs en rawNuevosData:', JSON.stringify(sample));
    }

    const row = STATE.rawNuevosData.find(r => String(r.id) === String(id));
    console.log('Resultado de búsqueda:', row ? 'ENCONTRADO' : 'NO ENCONTRADO');

    if (!row) {
        alert('No se encontró la operación con ID: ' + id + '. Consulta la consola (F12) para más detalles.');
        return;
    }

    document.getElementById('edit-sale-id').value = id;
    document.getElementById('modal-sale-title').textContent = 'Editar Operación';
    document.getElementById('btn-submit-sale').textContent = 'Actualizar Operación';

    // Parse date into YYYY-MM-DDTHH:MM — handles both ISO (from Supabase) and DD/MM/YYYY (from CSV)
    const dateStr = row['Marca temporal'] || row['Fecha de compra'] || '';
    let parsedDateVal = '';
    if (dateStr) {
        let dt;
        if (dateStr.includes('T') || /^\d{4}-/.test(dateStr)) {
            // ISO format: 2025-06-18T15:30:00 or 2025-06-18
            dt = new Date(dateStr);
        } else if (dateStr.includes('/')) {
            // DD/MM/YYYY HH:MM:SS format
            const parts = dateStr.split(/[\/ :]/);
            let y = parseInt(parts[2]); if (y < 100) y += 2000;
            dt = new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]),
                parseInt(parts[3] || 0), parseInt(parts[4] || 0));
        }
        if (dt && !isNaN(dt.getTime())) {
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            parsedDateVal = dt.toISOString().slice(0, 16);
        }
    }
    if (!parsedDateVal) {
        // Fallback: current time
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        parsedDateVal = now.toISOString().slice(0, 16);
    }
    document.getElementById('sale-date').value = parsedDateVal;

    const setSelectSafe = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!el.options) {
            el.value = val || '';
            return;
        }
        const opts = Array.from(el.options).map(o => o.value);
        if (opts.includes(val)) el.value = val;
    };

    setSelectSafe('sale-vendor', row['Vendedor']);
    document.getElementById('sale-client').value = row['Nombre completo'] || row['Nombre de cliente'] || '';
    if (document.getElementById('sale-email')) document.getElementById('sale-email').value = row['Email'] || row['Correo Electrónico'] || '';

    // Check corresponding product checkboxes
    const productListStr = row['Qué compra?'] || row['Producto'] || '';
    const productCheckboxes = document.querySelectorAll('input[name="product-option"]');
    productCheckboxes.forEach(cb => {
        if (productListStr.toLowerCase().includes(cb.value.toLowerCase())) {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });

    // Parse amount back to native number float
    let valStr = row['Valor de compra TOTAL (independientemente de que pague mensual)'] || row['Ticket total'] || '0';
    valStr = String(valStr).replace('€', '').trim().replace(',', '.');
    document.getElementById('sale-amount').value = parseFloat(valStr) || 0;

    setSelectSafe('sale-renewal', row['Renovación'] || row['Es una renovación?']);
    setSelectSafe('sale-country', row['País'] || row['En qué país vive?']);
    setSelectSafe('sale-language', row['Idioma']);
    setSelectSafe('sale-payment-method', row['Forma de pago']);
    document.getElementById('sale-promise').value = row['Promesa'] || row['Qué se le promete al cliente'] || '';

    document.getElementById('new-sale-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
};


function initSearch() {
    // Removed
}

// --- Core Data Fetching from Supabase ---

async function fetchSupabaseData() {
    showLoading();

    // Hard timeout - never hang longer than 15 seconds
    const timeoutId = setTimeout(() => {
        console.warn('Supabase fetch timed out - hiding spinner');
        hideLoading();
    }, 15000);

    try {
        const { data, error } = await supabaseClient
            .from('ventas')
            .select('*');

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            console.log('Fetched rows from Supabase:', data.length);
            // Debug: Show first 5 rows in a table to verify column names
            console.table(data.slice(0, 5));
            processNuevosData(data);
        } else {
            console.warn('No data found in Supabase yet.');
            processNuevosData([]);
        }
    } catch (err) {
        console.error('Error fetching data from Supabase:', err);
        showError('No se pudieron cargar los datos. Comprueba la conexión a Supabase.');
    } finally {
        clearTimeout(timeoutId);
        hideLoading();
    }
}

// (DOMContentLoaded merged into main listener above)

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('error-message').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showError(msg) {
    const errEl = document.getElementById('error-message');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

// --- Data Parsing (PapaParse) ---
function parseCSV(file, type) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (type === 'metodo') processMetodoData(results.data);

            STATE.processedCount++;
            checkProcessingComplete();
        },
        error: function (err) {
            showError(`Error leyendo el archivo ${file.name}: ${err.message}`);
            hideLoading();
        }
    });
}

function parseNuevosCSV(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        try {
            const data = manualCSVParse(text);
            let headerIdx = -1;

            // Buscar la fila que contiene los encabezados reales
            for (let i = 0; i < Math.min(15, data.length); i++) {
                if (data[i].some(cell => typeof cell === 'string' && (cell.includes('Marca temporal') || cell.includes('Valor de compra TOTAL')))) {
                    headerIdx = i;
                    break;
                }
            }

            if (headerIdx !== -1) {
                const headers = data[headerIdx];
                const parsedData = [];

                for (let i = headerIdx + 1; i < data.length; i++) {
                    const rowArray = data[i];
                    const rowObj = {};
                    for (let j = 0; j < headers.length; j++) {
                        const headerName = headers[j] ? headers[j].trim() : `Columna_Extra_${j}`;
                        rowObj[headerName] = rowArray[j];
                    }
                    parsedData.push(rowObj);
                }
                processNuevosData(parsedData);
            } else {
                showError(`No se encontraron los encabezados esperados en el archivo ${file.name}`);
                hideLoading();
            }

            STATE.processedCount++;
            checkProcessingComplete();
        } catch (err) {
            showError(`Error leyendo el archivo ${file.name}: ${err.message}`);
            hideLoading();
        }
    };
    reader.onerror = function () {
        showError(`Error leyendo el archivo ${file.name}`);
        hideLoading();
    };
    reader.readAsText(file);
}

function manualCSVParse(text) {
    const lines = text.split(/\r?\n/);
    const data = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur.trim());
        data.push(result);
    }
    return data;
}

function checkProcessingComplete() {
    // If both files updated or we only uploaded one, rebuild dash
    if (STATE.processedCount > 0) {
        updateDashboardUI();
        hideLoading();
    }
}

// --- Data Processing Logic ---

// Utils
function parseEuroValue(valStr) {
    if (valStr === undefined || valStr === null) return 0;
    if (typeof valStr === 'number') return valStr;

    // Remove Currency symbols and any random spaces
    let clean = String(valStr).replace(/[€\'\$]/g, '').trim();

    if (clean === '' || clean === '0,00') return 0;

    // Check if the number strictly has the Spanish comma formatting with thousands (e.g. 3.900,00 or 1.200,50)
    // We remove the thousands separators (dots) and turn the decimal separator (comma) into a dot
    if (clean.includes(',') && clean.includes('.') && clean.indexOf(',') > clean.lastIndexOf('.')) {
        clean = clean.replace(/\./g, ''); // Remove thousand dots
        clean = clean.replace(/,/g, '.'); // Swap decimal comma to dot
    } else if (clean.includes(',')) {
        // Simple comma replace if there are no dots at all (e.g. 14,99) or if it's used as decimal
        // If there's a dot but it's AFTER the comma, it's weird, but we prioritize the comma as decimal in this context
        clean = clean.replace(/\./g, '');
        clean = clean.replace(/,/g, '.');
    }

    // Fallback cleanup: remove anything that isn't a digit, minus or dot
    clean = clean.replace(/[^\d.-]/g, '');

    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
}

function sanitizeString(str) {
    return str ? String(str).trim() : 'Desconocido';
}

// Helper to find a value by fuzzy checking column names
function getRowValFriendly(row, keywords) {
    const keys = Object.keys(row);
    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        for (const kw of keywords) {
            if (lowerKey.includes(kw.toLowerCase())) {
                return row[key];
            }
        }
    }
    return undefined;
}

// Helper: get the date string from a row regardless of column name (CSV vs Supabase)
function getDateStr(row) {
    // User priority: "Fecha de compra" (Column N)
    let raw = row['Fecha de compra'] || row['Marca temporal'] || row['Timestamp'] || row['created_at'];
    if (raw) return raw;
    return getRowValFriendly(row, ['fecha de compra', 'marca temporal', 'fecha', 'timestamp', 'date', 'created_at']) || '';
}

// Helper: get the product string from a row regardless of encoding
function getProductStr(row) {
    // User priority: "Qué compra?" (Column F)
    let raw = row['Qué compra?'] || row['Que compra?'] || row['QuĂ© compra?'] || row['Product'] || row['Producto'];
    if (raw) return raw;
    return getRowValFriendly(row, ['compra', 'product', 'servicio']) || 'Desconocido';
}

/**
 * Normalizes encoding issues (MǸtodo, Milǭn) and classifies into user-defined categories.
 */
function normalizeAndClassifyProduct(str) {
    if (!str || str === 'Desconocido') return 'Otros';

    // Fix encoding artifacts
    let p = String(str)
        .replace(/MǸtodo/g, 'Método')
        .replace(/Milǭn/g, 'Milán')
        .replace(/QuǸ/g, 'Qué')
        .replace(/Biomecǭnica/g, 'Biomecánica')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents for matching
        .toLowerCase();

    if (p.includes('metodo sas') || p.includes('sas method')) return 'Método SAS';
    if (p.includes('sun&fun') || p.includes('sun and fun')) return 'Sun&Fun';
    if (p.includes('milan')) return 'SAS Meeting Milán';
    if (p.includes('madrid')) return 'SAS Meeting Madrid';
    if (p.includes('peer to peer')) return 'Peer to peer IT';
    if (p.includes('biomecanica') || p.includes('biomeccanica')) return 'Biomecánica';
    if (p.includes('tps')) return 'TPS';
    if (p.includes('rno')) return 'RNO';
    if (p.includes('sas club')) return 'SAS Club';
    if (p.includes('allineatori')) return 'Allineatori e Biomeccanica';
    if (p.includes('pack sesiones')) return 'Pack Sesiones 1:1';
    if (p.includes('in-office')) return 'In-office';
    if (p.includes('metodo regular') || p.includes('regular method')) return 'Método SAS'; // Classified as SAS Method per user list

    return 'Otros / Consultoría';
}

function processNuevosData(data) {
    console.log("Processing Nuevos (Sales) Data", data.length, "rows");

    // Save raw data for filtering
    STATE.rawNuevosData = data;

    // Extract unique years, months, cycles, and vendors
    const uniqueYears = new Set();
    const uniqueMonths = new Set();
    const uniqueCycles = new Set();
    const uniqueVendors = new Set();

    data.forEach(row => {
        // Normal Months/Years — use Marca temporal (Supabase) or Fecha de compra (CSV)
        const dateStr = getDateStr(row);
        if (dateStr && dateStr.trim() !== '') {
            let y = null;
            let m = null;
            if (dateStr.includes('T') && dateStr.includes('-')) {
                const d = new Date(dateStr);
                y = d.getFullYear().toString();
                m = String(d.getMonth() + 1).padStart(2, '0');
            } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                const parts = dateStr.split('-');
                y = parts[0];
                m = parts[1];
            } else {
                const parts = dateStr.split(/[\/\-]/);
                if (parts.length >= 2) {
                    m = parts[1].padStart(2, '0');
                    const yRaw = parts.length === 3 ? parts[2] : '2025';
                    y = yRaw.split(' ')[0].trim();
                }
            }
            if (y && m && /^\d{4}$/.test(y) && /^\d{2}$/.test(m)) {
                uniqueYears.add(y);
                uniqueMonths.add(m);
            }
        }

        // Cycles (Fecha de compra prioritized via getDateStr)
        const cycle = getSalesCycle(getDateStr(row));
        if (cycle) uniqueCycles.add(cycle);

        // Vendors
        const rawVendor = sanitizeString(row['Vendedor']);
        let normalizedSeller = rawVendor.toLowerCase();
        if (normalizedSeller.includes('publi')) normalizedSeller = 'Publicidad';
        else if (normalizedSeller.includes('calendario') || normalizedSeller.includes('campa')) normalizedSeller = 'Campaña';
        else if (rawVendor === '') normalizedSeller = 'Otros';
        else normalizedSeller = rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1);

        if (normalizedSeller !== 'Desconocido' && normalizedSeller !== 'Otros') {
            uniqueVendors.add(normalizedSeller);
        }
    });

    populateYearDropdown(Array.from(uniqueYears).sort().reverse());
    populateMonthDropdown(Array.from(uniqueMonths).sort().reverse());
    populateCycleDropdown(Array.from(uniqueCycles).sort().reverse());
    populateVendorDropdown(Array.from(uniqueVendors).sort());

    aggregateNuevosData(data);
    updateDashboardUI();  // render main KPIs and charts
    updateVendorUI();
}

function getSalesCycle(dateString) {
    if (!dateString || dateString.trim() === '') return null;
    const parts = dateString.split('/');
    if (parts.length < 2) return null;

    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const yRaw = parts.length === 3 ? parts[2] : '2025';
    const y = parseInt(yRaw.split(' ')[0].trim(), 10);

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;

    let cycleMonth = m;
    let cycleYear = y;

    // If day is 25 or greater, count towards the NEXT month's cycle
    if (d >= 25) {
        cycleMonth++;
        if (cycleMonth > 12) {
            cycleMonth = 1;
            cycleYear++;
        }
    }

    const strM = String(cycleMonth).padStart(2, '0');
    return `${cycleYear}-${strM}`;
}

function populateCycleDropdown(cycles) {
    const select = document.getElementById('cycleFilter');
    if (!select) return;

    select.innerHTML = '<option value="all">Todos los Ciclos</option>';

    cycles.forEach(cycleKey => {
        const [y, m] = cycleKey.split('-');
        const date = new Date(y, parseInt(m) - 1, 1);
        const monthName = date.toLocaleDateString('es-ES', { month: 'long' });

        // E.g. Ciclo Marzo (25 Feb - 24 Mar)
        let prevM = parseInt(m) - 1;
        let prevY = parseInt(y);
        if (prevM === 0) { prevM = 12; prevY--; }
        const prevDate = new Date(prevY, prevM - 1, 1);
        const prevMonthName = prevDate.toLocaleDateString('es-ES', { month: 'short' });
        const curMonthNameShort = date.toLocaleDateString('es-ES', { month: 'short' });

        const label = `Ciclo ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} (25 ${prevMonthName} - 24 ${curMonthNameShort})`;

        const option = document.createElement('option');
        option.value = cycleKey;
        option.textContent = label;
        select.appendChild(option);
    });

    if (STATE.selectedCycle !== 'all' && cycles.includes(STATE.selectedCycle)) {
        select.value = STATE.selectedCycle;
    } else {
        STATE.selectedCycle = 'all';
    }
}

function populateVendorDropdown(vendors) {
    const select = document.getElementById('vendorFilter');
    if (!select) return;

    // Fixed vendor list as defined by the user
    const KNOWN_VENDORS = ['Fer', 'Josema', 'Álvaro', 'Javi'];

    select.innerHTML = '<option value="none">Seleccione Vendedor</option>';
    select.innerHTML += '<option value="all">Todos los Vendedores</option>';

    KNOWN_VENDORS.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor;
        option.textContent = vendor;
        select.appendChild(option);
    });

    // 'Otros' bucket for anything not in the known list
    const otros = document.createElement('option');
    otros.value = 'Otros';
    otros.textContent = 'Otros';
    select.appendChild(otros);

    if (STATE.selectedVendor !== 'none' && (KNOWN_VENDORS.includes(STATE.selectedVendor) || STATE.selectedVendor === 'all' || STATE.selectedVendor === 'Otros')) {
        select.value = STATE.selectedVendor;
    } else {
        STATE.selectedVendor = 'none';
    }
}

function populateYearDropdown(years) {
    const select = document.getElementById('yearFilter');
    if (!select) return;

    select.innerHTML = '<option value="all">Todos los Años</option>';
    years.forEach(y => {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        select.appendChild(option);
    });

    if (STATE.selectedYear !== 'all' && years.includes(STATE.selectedYear)) {
        select.value = STATE.selectedYear;
    } else {
        STATE.selectedYear = 'all';
    }
}

function populateMonthDropdown(months) {
    const select = document.getElementById('monthFilter');
    if (!select) return;

    select.innerHTML = '<option value="all">Todos los Meses</option>';

    months.forEach(m => {
        const date = new Date(2025, parseInt(m) - 1, 1);
        const label = date.toLocaleDateString('es-ES', { month: 'long' });

        const option = document.createElement('option');
        option.value = m;
        option.textContent = label.charAt(0).toUpperCase() + label.slice(1);
        select.appendChild(option);
    });

    // Maintain previously selected month if it exists
    if (STATE.selectedMonth !== 'all' && months.includes(STATE.selectedMonth)) {
        select.value = STATE.selectedMonth;
    } else {
        STATE.selectedMonth = 'all';
    }
}
function aggregateNuevosData(data) {
    // Reset state
    STATE.salesByMonth = {};
    STATE.salesByDay = {}; // New state for daily breakdown
    STATE.salesBySeller = {};
    STATE.unitsByProduct = {};
    STATE.totalSales = 0;
    STATE.totalUnits = 0;

    data.forEach(row => {
        // Parse date — works with Supabase (Marca temporal) and CSV (Fecha de compra)
        const dateStr = getDateStr(row);
        if (!dateStr || dateStr.trim() === '') return;

        // Extract month/year for grouping
        let saleYear = null;
        let saleMonth = null;
        let saleDay = null; // New variable for day extraction
        let monthKey = 'Sin fecha';
        let dayKey = 'Sin fecha';

        // Handle ISO dates from DB (e.g. 2025-06-18T15:30:00Z) vs normal CSV (18/06/2025)
        if (dateStr.includes('T') && dateStr.includes('-')) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                saleYear = d.getFullYear().toString();
                saleMonth = String(d.getMonth() + 1).padStart(2, '0');
                saleDay = String(d.getDate()).padStart(2, '0');
                monthKey = `${saleYear}-${saleMonth}`;
                dayKey = `${saleYear}-${saleMonth}-${saleDay}`;
            }
        }
        // Handle YYYY-MM-DD
        else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            const parts = dateStr.split('-');
            saleYear = parts[0];
            saleMonth = parts[1];
            saleDay = parts[2].split(' ')[0].trim(); // Remove time if present
            monthKey = `${saleYear}-${saleMonth}`;
            dayKey = `${saleYear}-${saleMonth}-${saleDay.padStart(2, '0')}`;
        }
        // Handle DD/MM/YYYY
        else {
            const parts = dateStr.split(/[\/\-]/);
            if (parts.length >= 2) {
                saleDay = parts[0].padStart(2, '0');
                saleMonth = parts[1].padStart(2, '0');
                const yRaw = parts.length === 3 ? parts[2] : '2025';
                saleYear = yRaw.split(' ')[0].trim(); // Remove time if present

                if (/^\d{4}$/.test(saleYear) && /^\d{2}$/.test(saleMonth)) {
                    monthKey = `${saleYear}-${saleMonth}`;
                    dayKey = `${saleYear}-${saleMonth}-${saleDay}`;
                }
            }
        }

        // Filter out by selected year/month
        if (STATE.selectedYear !== 'all' && saleYear !== STATE.selectedYear) return;
        if (STATE.selectedMonth !== 'all' && saleMonth !== STATE.selectedMonth) return;

        // Sales Amount (User priority: "Valor de compra" (Column L))
        let valStr = row['Valor de compra'] || row['Ticket total'] || row['Valor de compra TOTAL (independientemente de que pague mensual)'];

        if (valStr === undefined || valStr === null || String(valStr).trim() === '' || String(valStr).trim() === '0,00 €' || String(valStr).trim() === '0,00 \'') {
            valStr = getRowValFriendly(row, ['valor de compra', 'ticket', 'total', 'valor', 'importe', 'compra total']) || '';
        }

        const saleAmount = parseEuroValue(valStr);

        // Debug first row's columns to see what we actually received from Supabase
        if (row === data[0]) {
            console.log("FIRST ROW KEYS FROM SUPABASE:", Object.keys(row));
            console.log("Extracted Date:", dateStr, "| Extracted Value:", valStr, "->", saleAmount);
        }

        // Seller
        const seller = sanitizeString(row['Vendedor']);

        // Product (User fix: Split by comma to count each unit individually)
        const productVal = getProductStr(row);
        if (productVal && productVal !== 'Desconocido') {
            const products = String(productVal).split(',').map(p => p.trim()).filter(p => p !== '');
            products.forEach(p => {
                const cleanP = normalizeAndClassifyProduct(p);
                if (cleanP && cleanP !== 'Otros') {
                    STATE.totalUnits++;
                    STATE.unitsByProduct[cleanP] = (STATE.unitsByProduct[cleanP] || 0) + 1;
                }
            });
        }

        // Debug March 2026 data
        if (saleMonth === '03' && saleYear === '2026') {
            console.log(`MARCH 2026 ROW: Date=${dateStr} | Product=${productVal} | Value=${valStr} -> ${saleAmount}€ | Seller=${seller}`);
        }

        // Aggregate Sales
        STATE.totalSales += saleAmount;

        STATE.salesByMonth[monthKey] = (STATE.salesByMonth[monthKey] || 0) + saleAmount;
        STATE.salesByDay[dayKey] = (STATE.salesByDay[dayKey] || 0) + saleAmount;

        if (saleAmount > 0) {
            let normalizedSeller = seller.toLowerCase();
            if (normalizedSeller.includes('publi')) normalizedSeller = 'Publicidad';
            else if (normalizedSeller.includes('calendario') || normalizedSeller.includes('campa')) normalizedSeller = 'Campaña';
            else if (seller === '') normalizedSeller = 'Otros';
            else normalizedSeller = seller.charAt(0).toUpperCase() + seller.slice(1);

            STATE.salesBySeller[normalizedSeller] = (STATE.salesBySeller[normalizedSeller] || 0) + saleAmount;
        }
    });
}

function processMetodoData(data) {
    console.log("Processing Metodo (Students) Data", data.length, "rows");

    STATE.activeStudents = [];
    STATE.renewalsYes = 0;
    STATE.renewalsNo = 0;

    data.forEach(row => {
        const name = sanitizeString(row['Nombre']);
        const email = sanitizeString(row['Email']);
        const isActiveStr = sanitizeString(row['En vigor']).toUpperCase();
        const endDate = sanitizeString(row['Fecha\nfin'] || row['Fecha fin']);
        const product = sanitizeString(row['Producto']);
        const renuevaStr = sanitizeString(row['Renueva']).toUpperCase();

        if (name !== 'Desconocido' && name !== '') {
            const isActive = isActiveStr === 'SI' || isActiveStr === 'TRUE';

            if (renuevaStr === 'SI' || renuevaStr === 'SÍ') {
                STATE.renewalsYes++;
            } else if (renuevaStr === 'NO') {
                STATE.renewalsNo++;
            }

            STATE.activeStudents.push({
                name,
                email,
                product,
                endDate,
                isActive
            });
        }
    });

    // Sort active first, then by name
    STATE.activeStudents.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
    });
}

// --- UI Updating ---

function updateDashboardUI() {
    // Update KPIs
    const formatCurrency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    document.getElementById('kpi-total-sales').textContent = formatCurrency.format(STATE.totalSales);
    document.getElementById('kpi-total-units').textContent = STATE.totalUnits;

    const activeCount = STATE.activeStudents.filter(s => s.isActive).length;
    document.getElementById('kpi-active-students').textContent = activeCount;

    const totalRenewals = STATE.renewalsYes + STATE.renewalsNo;
    const renewalRate = totalRenewals > 0 ? Math.round((STATE.renewalsYes / totalRenewals) * 100) : 0;

    const renewalRateEl = document.getElementById('kpi-renewal-rate');
    if (renewalRateEl) {
        renewalRateEl.textContent = renewalRate + '%';
        document.getElementById('kpi-renewal-info').textContent = `${STATE.renewalsYes} Sí / ${STATE.renewalsNo} No`;
    }

    // If no sales found globally or for selected month, show a warning in console/UI
    if (STATE.totalSales === 0 && STATE.rawNuevosData.length > 0) {
        console.warn('DASHBOARD: Data fetched but no sales aggregated. Check column mappings!');
        showError('No se encontraron ventas para el filtro seleccionado. Revisa las columnas del CSV en la consola (F12).');
    } else {
        document.getElementById('error-message').classList.add('hidden');
    }

    // Render Charts
    renderSalesByMonthChart();
    renderSalesBySellerChart();
    renderUnitsByProductChart();
}

function updateVendorUI() {
    if (STATE.rawNuevosData.length === 0) return;

    const KNOWN_VENDORS = ['Fer', 'Josema', 'Álvaro', 'Javi'];

    let vendorSales = 0;
    let vendorUnits = 0;
    let metodoCount = 0; // Método SAS or Peer to peer IT depending on vendor
    const isAlvaro = STATE.selectedVendor === 'Álvaro';
    const tableBody = document.querySelector('#vendor-sales-table tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // If no vendor selected, just clear and return
    if (STATE.selectedVendor === 'none') {
        document.getElementById('kpi-vendor-sales').textContent = '0 €';
        document.getElementById('kpi-vendor-info').textContent = '0 Operaciones';
        return;
    }

    const formatCurrency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

    STATE.rawNuevosData.forEach(row => {
        // 1. Normalize vendor – bucket anyone not in KNOWN_VENDORS as 'Otros'
        const rawVendor = sanitizeString(row['Vendedor']);
        let normalizedSeller;
        const rawLower = rawVendor.toLowerCase();
        if (rawLower === 'fer') normalizedSeller = 'Fer';
        else if (rawLower === 'josema') normalizedSeller = 'Josema';
        else if (rawLower.includes('lvaro') || rawLower === 'Álvaro') normalizedSeller = 'Álvaro';
        else if (rawLower === 'javi') normalizedSeller = 'Javi';
        else normalizedSeller = 'Otros';

        // Filter by vendor
        if (STATE.selectedVendor !== 'all' && normalizedSeller !== STATE.selectedVendor) return;

        // 2. Filter by Cycle (Fecha de compra prioritized via getDateStr)
        const cycle = getSalesCycle(getDateStr(row));
        if (STATE.selectedCycle !== 'all' && cycle !== STATE.selectedCycle) return;

        // Extract Sale Amount (Priority: Valor de compra)
        let valStr = row['Valor de compra'] || row['Valor de compra TOTAL (independientemente de que pague mensual)'];
        if (!valStr || valStr.trim() === '' || valStr.trim() === '0,00 €' || valStr.trim() === '0,00\'') {
            valStr = row['Ticket total'];
        }
        const saleAmount = parseEuroValue(valStr);

        vendorSales += saleAmount;
        vendorUnits++;

        // Count product for commission tracker (context-aware)
        const productName = sanitizeString(getProductStr(row));
        // Normalize accents so é→e, ó→o, etc. regardless of encoding
        const productNorm = productName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const isRegularMethod = productNorm.includes('regular method') || productNorm.includes('metodo regular');
        const countsForCommission = isAlvaro
            ? productNorm.includes('peer') || productNorm.includes('p2p')
            : !isRegularMethod && (productNorm.includes('metodo sas') || productNorm.includes('sas method'));
        if (countsForCommission) metodoCount++;

        // Add to Table
        const tr = document.createElement('tr');

        const tdDate = document.createElement('td');
        tdDate.textContent = row['Fecha de compra'] || row['Marca temporal'] || 'Sin fecha';

        const tdClient = document.createElement('td');
        tdClient.textContent = sanitizeString(row['Nombre completo']);

        const tdProduct = document.createElement('td');
        tdProduct.textContent = productName;

        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency.format(saleAmount);

        const tdActions = document.createElement('td');
        if (row.id) {
            const btnEdit = document.createElement('button');
            btnEdit.className = 'action-btn';
            btnEdit.style.padding = '4px 8px';
            btnEdit.style.fontSize = '0.9rem';
            btnEdit.title = 'Editar Operación';
            btnEdit.innerHTML = '✏️';
            btnEdit.onclick = () => window.openEditModal(row.id);
            tdActions.appendChild(btnEdit);
        }

        tr.appendChild(tdDate);
        tr.appendChild(tdClient);
        tr.appendChild(tdProduct);
        tr.appendChild(tdAmount);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
    });

    document.getElementById('kpi-vendor-sales').textContent = formatCurrency.format(vendorSales);
    document.getElementById('kpi-vendor-metodo').textContent = metodoCount;
    // Update label dynamically based on who's selected
    const kpiMetodoTitle = document.querySelector('#view-vendors .kpi-card:nth-child(2) h3');
    if (kpiMetodoTitle) {
        kpiMetodoTitle.textContent = isAlvaro ? 'Peer to peer IT' : 'Método SAS / SAS Method';
    }
    document.getElementById('kpi-vendor-info').textContent = `${vendorUnits} Operaciones`;
}

// --- Chart.js Rendering ---

// Shared chart options for dark theme (harmonized with deep blue background)
Chart.defaults.color = '#cbd5e1';
Chart.defaults.font.family = 'Inter';
Chart.defaults.borderColor = 'rgba(155, 123, 247, 0.2)';

function getGradient(ctx, color1, color2) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
}

function renderSalesByMonthChart() {
    const ctx = document.getElementById('salesByMonthChart').getContext('2d');
    const titleEl = document.getElementById('salesChartTitle');

    let labels, dataObj, formattedLabels;
    let isDaily = STATE.selectedMonth !== 'all';

    if (isDaily) {
        if (titleEl) titleEl.textContent = 'Evolución de Ventas por Día';

        // Filter keys for current year/month
        const filteredKeys = Object.keys(STATE.salesByDay).filter(k => {
            if (k === 'Sin fecha') return false;
            const [y, m, d] = k.split('-');
            const yearMatch = STATE.selectedYear === 'all' || y === STATE.selectedYear;
            const monthMatch = m === STATE.selectedMonth;
            return yearMatch && monthMatch;
        }).sort();

        labels = filteredKeys;
        dataObj = labels.map(k => STATE.salesByDay[k]);

        // Format labels: YYYY-MM-DD -> DD
        formattedLabels = labels.map(l => {
            const parts = l.split('-');
            return parts.length === 3 ? parts[2] : l;
        });
    } else {
        if (titleEl) titleEl.textContent = 'Evolución de Ventas por Mes';

        // Use monthly state
        labels = Object.keys(STATE.salesByMonth).sort();
        dataObj = labels.map(k => STATE.salesByMonth[k]);

        // Format labels: YYYY-MM -> MMM YYYY
        formattedLabels = labels.map(l => {
            if (l === 'Sin fecha') return l;
            const [y, m] = l.split('-');
            const date = new Date(y, parseInt(m) - 1, 1);
            return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        });
    }

    if (charts.salesByMonth) charts.salesByMonth.destroy();

    const bgGradient = getGradient(ctx, 'rgba(155, 123, 247, 0.5)', 'rgba(155, 123, 247, 0.0)');

    charts.salesByMonth = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Ventas Totales (€)',
                data: dataObj,
                borderColor: '#9b7bf7',
                backgroundColor: bgGradient,
                borderWidth: 3,
                pointBackgroundColor: '#1e293b',
                pointBorderColor: '#9b7bf7',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value >= 1000 ? (value / 1000) + 'k €' : value + ' €';
                        }
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderSalesBySellerChart() {
    const ctx = document.getElementById('salesBySellerChart').getContext('2d');

    // Sort by sales descending, get top 7
    const sortedSellers = Object.entries(STATE.salesBySeller)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);

    const labels = sortedSellers.map(item => item[0]);
    const dataObj = sortedSellers.map(item => item[1]);

    if (charts.salesBySeller) charts.salesBySeller.destroy();

    charts.salesBySeller = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas (€)',
                data: dataObj,
                backgroundColor: chartColors.slice(0, labels.length),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bar chart
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value >= 1000 ? (value / 1000) + 'k' : value;
                        }
                    }
                },
                y: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderUnitsByProductChart() {
    const ctx = document.getElementById('unitsByProductChart').getContext('2d');

    // Sort by unit count descending
    const sortedGroups = Object.entries(STATE.unitsByProduct)
        .sort((a, b) => b[1] - a[1]);

    const labels = sortedGroups.map(item => item[0]);
    const dataObj = sortedGroups.map(item => item[1]);

    if (charts.unitsByProduct) charts.unitsByProduct.destroy();

    charts.unitsByProduct = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataObj,
                backgroundColor: chartColors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

// Removed Table Rendering


// ═══════════════════════════════════════════════════════════
// ADVERTISING ATTRIBUTION ENGINE
// ═══════════════════════════════════════════════════════════

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTcGM8DUSsRWHAvtFI7gOZ_k6tvOaT92EwhriZMA6g99Ch7UWmMo6gmeNLR7N-p4BYPR2f1CnFPEe2k/pub?gid=2019545794&single=true&output=csv';

// Classify a product string into a broad service type
function classifyProduct(productStr) {
    if (!productStr) return 'otro';
    const p = productStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (p.includes('metodo') || p.includes('sas method') || p.includes('peer to peer')) return 'metodo';
    if (p.includes('evento') || p.includes('event') || p.includes('formacion') || p.includes('curso') || p.includes('charity') || p.includes('lead magnet')) return 'evento';
    return 'otro';
}

// Calculate attribution value for a single lead+sale pair
function calculateAttribution(leadEntryDate, leadProduct, salePurchaseDate, saleProduct, saleAmount) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.round((salePurchaseDate - leadEntryDate) / msPerDay);
    if (days < 0) return { attribution: 0, days, model: 'Pre-lead', isCrossSell: false };

    const leadType = classifyProduct(leadProduct);
    const saleType = classifyProduct(saleProduct);
    const isCrossSell = leadType !== saleType;

    let attribution = 0;
    let model = '';

    if (saleType === 'metodo') {
        // Fixed 90-day window
        model = 'Ventana 90 días';
        attribution = days <= 90 ? saleAmount : 0;
    } else {
        // Temporal decay: Value × (1 – days/100), floor at 0
        const decay = Math.max(0, 1 - (days / 100));
        if (isCrossSell) {
            model = 'Cross-sell (50% + decay)';
            attribution = saleAmount * 0.5 * decay;
        } else {
            model = 'Degradación temporal';
            attribution = saleAmount * decay;
        }
    }

    return { attribution: Math.max(0, attribution), days, model, isCrossSell };
}

// Parse a DD/MM/YY or DD/MM/YYYY date string into a Date object
function parseSheetDate(str) {
    if (!str) return null;
    // Accept "18/06/25", "18/06/2025", "2025-06-18", etc.
    str = str.trim();
    let d;
    if (/^\d{2}\/\d{2}\/\d{2,4}/.test(str)) {
        const parts = str.split(/[\/ ]/);
        let y = parseInt(parts[2]);
        if (y < 100) y += 2000;
        d = new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else {
        d = new Date(str);
    }
    return isNaN(d.getTime()) ? null : d;
}

// Fetch leads from Google Sheet and run attribution
async function fetchAndRenderAttribution() {
    console.log('--- Iniciando carga de Leads desde Google Sheets ---');
    const loadingEl = document.getElementById('pub-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    // Helper: parse CSV text (no XHR, avoids CORS)
    function parseCsvText(text) {
        return Papa.parse(text, { header: true, skipEmptyLines: 'greedy' }).data;
    }

    try {
        // Strategy 1: Direct fetch() - more CORS-friendly than PapaParse XHR download
        const directUrl = SHEET_URL + '&t=' + Date.now();
        console.log('Intentando fetch directo:', directUrl);
        let csvText = null;

        try {
            const directResp = await fetch(directUrl);
            if (directResp.ok) csvText = await directResp.text();
        } catch (e) {
            console.warn('Fetch directo bloqueado, usando proxy...', e.message);
        }

        // Strategy 2: allorigins proxy fallback
        if (!csvText || csvText.length < 20) {
            console.log('Usando proxy allorigins...');
            const proxyResp = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(SHEET_URL));
            if (!proxyResp.ok) throw new Error('Proxy HTTP ' + proxyResp.status);
            const json = await proxyResp.json();
            csvText = json.contents;
            if (!csvText || csvText.length < 20) throw new Error('Proxy devolvio contenido vacio');
        }

        const rows = parseCsvText(csvText);
        if (!rows || rows.length === 0) throw new Error('CSV sin filas de datos');

        STATE.rawLeadsData = rows;
        STATE.leadsLoaded = true;
        console.log('Leads cargados:', rows.length, 'filas');
        updatePublicityUI();

    } catch (err) {
        console.error('Error cargando leads:', err);
        alert('No se pudieron cargar los leads. Error: ' + err.message);
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

function updatePublicityUI() {
    const leads = STATE.rawLeadsData;
    const sales = STATE.rawNuevosData;

    if (!leads.length) return;

    // Build an email lookup map for sales: email → [sale, ...]
    const salesByEmail = {};
    sales.forEach(sale => {
        const email = (sale['Email'] || '').trim().toLowerCase();
        if (email) {
            if (!salesByEmail[email]) salesByEmail[email] = [];
            salesByEmail[email].push(sale);
        }
    });

    const formatCurrency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

    // Filter leads by pub month/year filter
    const pubYearFilter = (document.getElementById('pubYearFilter') || {}).value || 'all';
    const pubMonthFilter = (document.getElementById('pubMonthFilter') || {}).value || 'all';

    // Filter to paid leads only (Fuente = 'Publicidad')
    const paidLeads = leads.filter(l => (l['Fuente'] || '').toLowerCase().includes('publicidad'));

    let totalAttribution = 0;
    let conversions = 0;
    const tableRows = [];

    paidLeads.forEach(lead => {
        // Handle different possible column names for Email, Date, Name
        const email = (
            lead['Correo electrónico'] ||
            lead['Email'] ||
            lead['Email Address'] || ''
        ).trim().toLowerCase();
        if (!email) return;

        const matchedSales = salesByEmail[email] || [];
        const leadDate = parseSheetDate(lead['Fecha'] || lead['Fecha de compra'] || lead['Marca temporal'] || lead['Timestamp'] || '');
        if (!leadDate) return;

        if (matchedSales.length === 0) {
            // Lead with no purchase found, still add to table with 0 attribution
            tableRows.push({ lead, sale: null, days: null, attr: 0, model: 'Sin compra' });
            return;
        }

        matchedSales.forEach(sale => {
            const saleDateStr = getDateStr(sale);
            const saleDate = parseSheetDate(saleDateStr.split(' ')[0]); // strip time
            if (!saleDate) return;

            // Year & Month filter
            if (pubYearFilter !== 'all' && String(saleDate.getFullYear()) !== pubYearFilter) return;
            if (pubMonthFilter !== 'all' && String(saleDate.getMonth() + 1).padStart(2, '0') !== pubMonthFilter) return;

            const saleAmount = parseEuroValue(
                sale['Valor de compra TOTAL (independientemente de que pague mensual)'] || sale['Ticket total'] || '0'
            );
            const result = calculateAttribution(
                leadDate,
                lead['Producto'] || '',
                saleDate,
                getProductStr(sale),
                saleAmount
            );

            totalAttribution += result.attribution;
            conversions++;
            tableRows.push({ lead, sale, days: result.days, attr: result.attribution, model: result.model, saleAmount, isCrossSell: result.isCrossSell, saleDate });
        });
    });

    // Populate KPIs
    document.getElementById('kpi-pub-leads').textContent = leads.length;
    document.getElementById('kpi-pub-paid').textContent = paidLeads.length;
    document.getElementById('kpi-pub-conversions').textContent = conversions;
    document.getElementById('kpi-pub-attribution').textContent = formatCurrency.format(totalAttribution);

    // Populate attribution table
    const tbody = document.querySelector('#pub-attribution-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const noDataEl = document.getElementById('pub-no-data');

    if (tableRows.length === 0) {
        if (noDataEl) noDataEl.classList.remove('hidden');
        return;
    }
    if (noDataEl) noDataEl.classList.add('hidden');

    // Sort by attribution descending
    tableRows.sort((a, b) => b.attr - a.attr);

    tableRows.forEach(({ lead, sale, days, attr, model, saleAmount, isCrossSell, saleDate }) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${lead['Nombre'] || lead['Nombre completo'] || '-'}</td>
            <td style="font-size:0.8rem">${lead['Email'] || '-'}</td>
            <td>${lead['Fecha'] || lead['Marca temporal'] || '-'}</td>
            <td>${lead['Producto'] || lead['Fuente'] || '-'}</td>
            <td>${saleDate ? saleDate.toLocaleDateString('es-ES') : '-'}</td>
            <td>${sale ? getProductStr(sale) : '-'}</td>
            <td>${days !== null ? days : '-'}</td>
            <td>${saleAmount !== undefined ? formatCurrency.format(saleAmount) : '-'}</td>
            <td style="font-size:0.8rem">${model}${isCrossSell ? ' <span style="color:#f59e0b">⚡cross-sell</span>' : ''}</td>
            <td style="color:${attr > 0 ? '#2dd4bf' : '#a0aec0'}; font-weight:600">${formatCurrency.format(attr)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Populate year/month dropdown for pub view
    const yearSet = new Set();
    const monthSet = new Set();
    leads.forEach(l => {
        const dt = parseSheetDate(l['Fecha de compra'] || l['Fecha'] || l['Marca temporal']);
        if (dt) {
            yearSet.add(String(dt.getFullYear()));
            monthSet.add(String(dt.getMonth() + 1).padStart(2, '0'));
        }
    });

    const pubYearSelect = document.getElementById('pubYearFilter');
    if (pubYearSelect) {
        const currentY = pubYearSelect.value;
        pubYearSelect.innerHTML = '<option value="all">Todos los Años</option>';
        [...yearSet].sort().reverse().forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            pubYearSelect.appendChild(opt);
        });
        if (currentY !== 'all' && [...yearSet].includes(currentY)) pubYearSelect.value = currentY;
    }

    const pubSelect = document.getElementById('pubMonthFilter');
    if (pubSelect) {
        const currentM = pubSelect.value;
        pubSelect.innerHTML = '<option value="all">Todos los Meses</option>';
        [...monthSet].sort().reverse().forEach(m => {
            const label = new Date(2025, parseInt(m) - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = label.charAt(0).toUpperCase() + label.slice(1);
            pubSelect.appendChild(opt);
        });
        if (currentM !== 'all' && [...monthSet].includes(currentM)) pubSelect.value = currentM;
    }
}

// Wire up the refresh and month filter for the publicity view
document.addEventListener('DOMContentLoaded', () => {
    const btnRefreshPub = document.getElementById('btn-refresh-pub');
    if (btnRefreshPub) {
        btnRefreshPub.addEventListener('click', () => {
            STATE.leadsLoaded = false;
            fetchAndRenderAttribution();
        });
    }

    const pubYearSelect = document.getElementById('pubYearFilter');
    if (pubYearSelect) {
        pubYearSelect.addEventListener('change', () => {
            if (STATE.leadsLoaded) updatePublicityUI();
        });
    }

    const pubMonthFilter = document.getElementById('pubMonthFilter');
    if (pubMonthFilter) {
        pubMonthFilter.addEventListener('change', () => {
            if (STATE.leadsLoaded) updatePublicityUI();
        });
    }
});

// --- Registro (Logs) Feature ---
let allLogs = [];

async function fetchLogs() {
    console.log('Fetching logs...');
    const loadingEl = document.getElementById('reg-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
        const { data, error } = await supabaseClient
            .from('ventas_logs')
            .select('*')
            .order('fecha_modificacion', { ascending: false })
            .limit(150);

        if (error) throw error;

        allLogs = data || [];
        populateLogFilters();
        renderLogs();
    } catch (err) {
        console.error('Error fetching logs:', err);
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

function populateLogFilters() {
    const yearSelect = document.getElementById('regYearFilter');
    const monthSelect = document.getElementById('regMonthFilter');
    if (!yearSelect || !monthSelect) return;

    const years = new Set();
    const months = new Set();

    allLogs.forEach(log => {
        const d = new Date(log.fecha_modificacion);
        if (!isNaN(d)) {
            years.add(d.getFullYear().toString());
            months.add((d.getMonth() + 1).toString());
        }
    });

    // Populate Year
    const currentY = yearSelect.value;
    yearSelect.innerHTML = '<option value="all">Todos</option>';
    [...years].sort().reverse().forEach(y => {
        yearSelect.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
    });
    if (currentY !== 'all' && [...years].includes(currentY)) yearSelect.value = currentY;

    // Populate Month
    const currentM = monthSelect.value;
    monthSelect.innerHTML = '<option value="all">Todos los Meses</option>';
    [...months].sort((a, b) => parseInt(a) - parseInt(b)).forEach(m => {
        const label = new Date(2025, parseInt(m) - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
        monthSelect.insertAdjacentHTML('beforeend', `<option value="${m}">${label.charAt(0).toUpperCase() + label.slice(1)}</option>`);
    });
    if (currentM !== 'all' && [...months].includes(currentM)) monthSelect.value = currentM;
}

function renderLogs() {
    const tbody = document.querySelector('#registro-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const yFilter = document.getElementById('regYearFilter')?.value || 'all';
    const mFilter = document.getElementById('regMonthFilter')?.value || 'all';

    const filtered = allLogs.filter(log => {
        const d = new Date(log.fecha_modificacion);
        if (isNaN(d)) return false;

        const yMatch = (yFilter === 'all') || (d.getFullYear().toString() === yFilter);
        const mMatch = (mFilter === 'all') || ((d.getMonth() + 1).toString() === mFilter);
        return yMatch && mMatch;
    });

    filtered.forEach(log => {
        const tr = document.createElement('tr');

        const d = new Date(log.fecha_modificacion);
        const tdDate = document.createElement('td');
        tdDate.textContent = d.toLocaleString('es-ES');

        const tdEditor = document.createElement('td');
        tdEditor.textContent = log.usuario_editor || 'Desconocido';

        const clientName = (log.datos_anteriores && log.datos_anteriores['Nombre completo']) || log.venta_id || '-';
        const tdClient = document.createElement('td');
        tdClient.textContent = clientName;

        const tdChanges = document.createElement('td');
        tdChanges.style.fontSize = '0.85rem';

        // Compare previous and new JSON
        let changesStr = '';
        if (log.datos_anteriores && log.datos_nuevos) {
            const keys = new Set([...Object.keys(log.datos_anteriores), ...Object.keys(log.datos_nuevos)]);
            keys.forEach(k => {
                const oldV = log.datos_anteriores[k];
                const newV = log.datos_nuevos[k];
                if (String(oldV) !== String(newV) && k !== 'id') {
                    changesStr += `<b>${k}:</b> <span style="color:#ef4444;text-decoration:line-through">${oldV || '(vacío)'}</span> ➜ <span style="color:#10b981">${newV || '(vacío)'}</span><br/>`;
                }
            });
        }
        if (!changesStr) changesStr = '<i>Mismos datos guardados</i>';

        tdChanges.innerHTML = changesStr;

        tr.appendChild(tdDate);
        tr.appendChild(tdEditor);
        tr.appendChild(tdClient);
        tr.appendChild(tdChanges);
        tbody.appendChild(tr);
    });
}

// Add event listeners for log filters
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('regYearFilter')?.addEventListener('change', renderLogs);
    document.getElementById('regMonthFilter')?.addEventListener('change', renderLogs);
});
