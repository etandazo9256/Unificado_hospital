// dashboard-exports.js
// Exportación Excel y PDF - HEP Portoviejo

const API_BASE = '/api';

// Variable global para rastrear el período activo
let periodoActivo = 'todos';

async function fetchReportData(fechaInicio, fechaFin) {
    const params = new URLSearchParams();
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    const query = params.toString() ? `?${params.toString()}` : '';

    const [resumen, prioridades, productividad, tendenciaHora, tendenciaFecha] = await Promise.all([
        fetch(`${API_BASE}/kpis/resumen${query}`).then(r => r.json()),
        fetch(`${API_BASE}/kpis/prioridad${query}`).then(r => r.json()),
        fetch(`${API_BASE}/kpis/productividad${query}`).then(r => r.json()),
        fetch(`${API_BASE}/kpis/tendencia-hora${query}`).then(r => r.json()),
        fetch(`${API_BASE}/kpis/tendencia-fecha${query}`).then(r => r.json())
    ]);

    return { resumen, prioridades, productividad, tendenciaHora, tendenciaFecha };
}

function formatFecha(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Unifica las prioridades antiguas (ROJO/AMARILLO/VERDE/AZUL/NARANJA)
// con las de Manchester (P1-P5) en etiquetas únicas con su total
const PRIORIDAD_MAP = {
    'P1-RESUCITACION': { label: 'P1 Resucitación', order: 1 },
    'ROJO': { label: 'P1 Resucitación', order: 1 },
    'P2-EMERGENCIA': { label: 'P2 Emergencia', order: 2 },
    'NARANJA': { label: 'P2 Emergencia', order: 2 },
    'P3-URGENCIA': { label: 'P3 Urgencia', order: 3 },
    'AMARILLO': { label: 'P3 Urgencia', order: 3 },
    'P4-MENOS_URGENTE': { label: 'P4 Menos Urgente', order: 4 },
    'VERDE': { label: 'P4 Menos Urgente', order: 4 },
    'P5-NO_URGENTE': { label: 'P5 No Urgente', order: 5 },
    'AZUL': { label: 'P5 No Urgente', order: 5 },
    'SIN CLASIFICAR': { label: 'Sin Clasificar', order: 6 }
};

function unificarPrioridades(prioridades) {
    const agrupado = {};
    (prioridades || []).forEach(p => {
        const map = PRIORIDAD_MAP[p.prioridad];
        const label = map ? map.label : p.prioridad || 'Sin Clasificar';
        const order = map ? map.order : 99;
        if (!agrupado[label]) {
            agrupado[label] = { label, order, cantidad: 0 };
        }
        agrupado[label].cantidad += parseInt(p.cantidad) || 0;
    });
    return Object.values(agrupado)
        .sort((a, b) => a.order - b.order)
        .map(g => [g.label, g.cantidad]);
}

function formatFechaLarga(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Genera el título del reporte según el período
function getTituloReporte(periodo) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const hoy = new Date();

    switch (periodo) {
        case 'semana_actual': {
            const diaSemana = hoy.getDay();
            const diffLunes = diaSemana === 0 ? 6 : diaSemana - 1;
            const inicio = new Date(hoy);
            inicio.setDate(hoy.getDate() - diffLunes);
            const fin = new Date(hoy);
            return `REPORTE SEMANAL\nSemana del ${formatFechaLarga(inicio.toISOString())} al ${formatFechaLarga(fin.toISOString())}`;
        }
        case 'semana_anterior': {
            const diaSemana = hoy.getDay();
            const diffLunes = diaSemana === 0 ? 6 : diaSemana - 1;
            const inicio = new Date(hoy);
            inicio.setDate(hoy.getDate() - diffLunes - 7);
            const fin = new Date(inicio);
            fin.setDate(inicio.getDate() + 6);
            return `REPORTE SEMANAL\nSemana del ${formatFechaLarga(inicio.toISOString())} al ${formatFechaLarga(fin.toISOString())}`;
        }
        case 'mes_actual':
            return `REPORTE MENSUAL\n${meses[hoy.getMonth()]} ${hoy.getFullYear()}`;
        case 'mes_anterior': {
            const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            return `REPORTE MENSUAL\n${meses[mesAnt.getMonth()]} ${mesAnt.getFullYear()}`;
        }
        case 'trimestre':
            return `REPORTE TRIMESTRAL\nÚltimos 3 meses`;
        case 'anio_actual':
            return `REPORTE ANUAL\nAño ${hoy.getFullYear()}`;
        case 'anio_anterior':
            return `REPORTE ANUAL\nAño ${hoy.getFullYear() - 1}`;
        default:
            return `REPORTE GENERAL\nTodos los registros`;
    }
}

// Nombre del archivo según el período
function getNombreArchivo(periodo, extension) {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                   'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    switch (periodo) {
        case 'semana_actual':
        case 'semana_anterior':
            return `Reporte_Semanal_Hospital_${fecha}.${extension}`;
        case 'mes_actual':
            return `Reporte_Mensual_Hospital_${meses[hoy.getMonth()]}_${hoy.getFullYear()}.${extension}`;
        case 'mes_anterior': {
            const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            return `Reporte_Mensual_Hospital_${meses[mesAnt.getMonth()]}_${mesAnt.getFullYear()}.${extension}`;
        }
        case 'trimestre':
            return `Reporte_Trimestral_Hospital_${fecha}.${extension}`;
        case 'anio_actual':
            return `Reporte_Anual_Hospital_${hoy.getFullYear()}.${extension}`;
        case 'anio_anterior':
            return `Reporte_Anual_Hospital_${hoy.getFullYear() - 1}.${extension}`;
        default:
            return `Reporte_KPI_Hospital_${fecha}.${extension}`;
    }
}

function getPeriodoSubtitulo(fechaInicio, fechaFin) {
    if (fechaInicio && fechaFin) {
        return `Período: ${formatFecha(fechaInicio)} al ${formatFecha(fechaFin)}`;
    } else if (fechaInicio) {
        return `Desde: ${formatFecha(fechaInicio)}`;
    } else if (fechaFin) {
        return `Hasta: ${formatFecha(fechaFin)}`;
    }
    return 'Todos los registros';
}

// Carga el logo del hospital como Data URL (base64) para incrustarlo en reportes
async function obtenerLogoBase64() {
    try {
        const resp = await fetch('logo-hospital.png');
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('No se pudo cargar el logo:', e);
        return null;
    }
}

// ==================== EXPORTAR EXCEL ====================
async function exportarExcel(fechaInicio, fechaFin) {
    try {
        mostrarLoadingExport(true);
        const data = await fetchReportData(fechaInicio, fechaFin);
        const logoDataUrl = await obtenerLogoBase64();
        const [linea1, linea2] = getTituloReporte(periodoActivo).split('\n');
        const subtitulo = getPeriodoSubtitulo(fechaInicio, fechaFin);

        if (typeof ExcelJS === 'undefined') {
            alert('La librería de Excel no está disponible. Verifique su conexión a internet.');
            return false;
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Hospital de Especialidades Portoviejo';
        wb.created = new Date();

        const AZUL = 'FF0B2F5C';
        const GRIS = 'FFE8EDF5';

        // Renderiza un encabezado de sección con fondo azul
        function agregarSeccion(ws, fila, titulo) {
            ws.getCell(`A${fila}`).value = titulo;
            ws.getCell(`A${fila}`).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            ws.getCell(`A${fila}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
            ws.mergeCells(`A${fila}:B${fila}`);
            ws.getRow(fila).height = 18;
            return fila + 1;
        }

        // Renderiza una tabla simple (headers + filas)
        function renderTabla(ws, fila, headers, rows) {
            headers.forEach((h, i) => {
                const cell = ws.getCell(fila, i + 1);
                cell.value = h;
                cell.font = { bold: true, size: 9, color: { argb: 'FF333333' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
                cell.alignment = { vertical: 'middle' };
            });
            ws.getRow(fila).height = 16;
            fila++;
            rows.forEach(r => {
                r.forEach((v, i) => {
                    const cell = ws.getCell(fila, i + 1);
                    cell.value = v;
                    cell.font = { size: 9 };
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDE3EC' } } };
                });
                fila++;
            });
            return fila + 1;
        }

        // ===== Hoja 1: Resumen KPIs =====
        const wsResumen = wb.addWorksheet('Resumen KPIs', { views: [{ showGridLines: false }] });
        wsResumen.columns = [{ width: 42 }, { width: 22 }];

        let fila = 1;
        if (logoDataUrl) {
            try {
                const imgId = wb.addImage({ base64: logoDataUrl.split(',')[1], extension: 'png' });
                wsResumen.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 275, height: 117 } });
            } catch (e) {
                console.warn('No se pudo insertar el logo en Excel:', e);
            }
        }

        fila = 7;
        wsResumen.getCell(`A${fila}`).value = 'HOSPITAL DE ESPECIALIDADES PORTOVIEJO';
        wsResumen.getCell(`A${fila}`).font = { bold: true, size: 14, color: { argb: AZUL }, name: 'Arial' };
        wsResumen.getRow(fila).height = 22;
        fila++;
        wsResumen.getCell(`A${fila}`).value = linea1;
        wsResumen.getCell(`A${fila}`).font = { bold: true, size: 11 };
        fila++;
        wsResumen.getCell(`A${fila}`).value = linea2;
        wsResumen.getCell(`A${fila}`).font = { size: 10, italic: true, color: { argb: 'FF555555' } };
        fila += 2;
        wsResumen.getCell(`A${fila}`).value = subtitulo;
        wsResumen.getCell(`A${fila}`).font = { size: 10 };
        fila++;
        wsResumen.getCell(`A${fila}`).value = `Fecha de exportación: ${new Date().toLocaleString('es-ES')}`;
        wsResumen.getCell(`A${fila}`).font = { size: 9, italic: true, color: { argb: 'FF777777' } };
        fila += 2;

        fila = agregarSeccion(wsResumen, fila, 'RESUMEN GENERAL');
        fila = renderTabla(wsResumen, fila,
            ['Indicador', 'Valor'],
            [
                ['Atendidos en Triage', data.resumen.total_atendidos],
                ['Pendientes de Triage', data.resumen.total_pendientes],
                ['Pacientes en Triage', data.resumen.en_triage],
                ['Pendientes de Médico', data.resumen.pendiente_medico],
                ['En Atención Médica', data.resumen.en_atencion_medica]
            ]);

        fila = agregarSeccion(wsResumen, fila, 'TIEMPOS PROMEDIO (Minutos)');
        fila = renderTabla(wsResumen, fila,
            ['Etapa', 'Minutos'],
            [
                ['Espera de Signos Vitales', data.resumen.avg_espera_signos],
                ['Toma de Signos Vitales', data.resumen.avg_duracion_signos],
                ['Espera de Triage', data.resumen.avg_espera_triage],
                ['Duración de Triage', data.resumen.avg_duracion_triage],
                ['Tiempo Total de Proceso', data.resumen.avg_total_triage]
            ]);

        // ===== Hoja 2: Distribución por Prioridad =====
        const wsPrioridad = wb.addWorksheet('Prioridad Triage', { views: [{ showGridLines: false }] });
        wsPrioridad.columns = [{ width: 30 }, { width: 16 }];
        fila = 1;
        fila = agregarSeccion(wsPrioridad, fila, 'DISTRIBUCIÓN POR PRIORIDAD DE TRIAGE');
        fila = renderTabla(wsPrioridad, fila,
            ['Prioridad', 'Total de Pacientes'],
            unificarPrioridades(data.prioridades));

        // ===== Hoja 3: Productividad del Personal =====
        const wsProd = wb.addWorksheet('Productividad', { views: [{ showGridLines: false }] });
        wsProd.columns = [{ width: 38 }, { width: 20 }];
        fila = 1;
        fila = agregarSeccion(wsProd, fila, 'PRODUCTIVIDAD DEL PERSONAL');
        fila = agregarSeccion(wsProd, fila, 'TOMA DE SIGNOS VITALES');
        fila = renderTabla(wsProd, fila,
            ['Personal', 'Pacientes Atendidos'],
            data.productividad.signos_vitales.map(p => [p.personal, p.cantidad]));
        fila++;
        fila = agregarSeccion(wsProd, fila, 'EVALUACIÓN DE TRIAGE');
        fila = renderTabla(wsProd, fila,
            ['Personal', 'Pacientes Atendidos'],
            data.productividad.triage.map(p => [p.personal, p.cantidad]));

        // ===== Hoja 4: Tendencia por Hora =====
        const wsHora = wb.addWorksheet('Tendencia por Hora', { views: [{ showGridLines: false }] });
        wsHora.columns = [{ width: 14 }, { width: 26 }];
        fila = 1;
        fila = agregarSeccion(wsHora, fila, 'DISTRIBUCIÓN DE ADMISIONES POR HORA');
        fila = renderTabla(wsHora, fila,
            ['Hora', 'Cantidad de Pacientes'],
            data.tendenciaHora.map(h => [`${h.hora.toString().padStart(2, '0')}:00`, h.cantidad]));

        // ===== Hoja 5: Evolución Diaria =====
        const wsFecha = wb.addWorksheet('Evolución Diaria', { views: [{ showGridLines: false }] });
        wsFecha.columns = [{ width: 14 }, { width: 14 }, { width: 30 }];
        fila = 1;
        fila = agregarSeccion(wsFecha, fila, 'EVOLUCIÓN DIARIA DE ADMISIONES');
        const headers = ['Fecha', 'Pacientes', 'Tiempo Prom. Triage (min)'];
        headers.forEach((h, i) => {
            const cell = wsFecha.getCell(fila, i + 1);
            cell.value = h;
            cell.font = { bold: true, size: 9, color: { argb: 'FF333333' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
        });
        wsFecha.getRow(fila).height = 16;
        fila++;
        data.tendenciaFecha.forEach(f => {
            wsFecha.getCell(fila, 1).value = formatFecha(f.fecha);
            wsFecha.getCell(fila, 2).value = f.cantidad;
            wsFecha.getCell(fila, 3).value = f.avg_total_triage;
            [1, 2, 3].forEach(c => {
                wsFecha.getCell(fila, c).font = { size: 9 };
                wsFecha.getCell(fila, c).border = { bottom: { style: 'thin', color: { argb: 'FFDDE3EC' } } };
            });
            fila++;
        });

        // Descargar archivo
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getNombreArchivo(periodoActivo, 'xlsx');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (error) {
        console.error('Error al exportar Excel:', error);
        alert('Error al generar el archivo Excel. Verifique la conexión al servidor.');
        return false;
    } finally {
        mostrarLoadingExport(false);
    }
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF(fechaInicio, fechaFin) {
    try {
        mostrarLoadingExport(true);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = margin;

        const logoDataUrl = await obtenerLogoBase64();
        const [linea1, linea2] = getTituloReporte(periodoActivo).split('\n');
        const subtitulo = getPeriodoSubtitulo(fechaInicio, fechaFin);

        // Función auxiliar para encabezado
        function drawHeader() {
            doc.setFillColor(11, 47, 92);
            doc.rect(0, 0, pageWidth, 38, 'F');

            const textX = 60;
            if (logoDataUrl) {
                try {
                    doc.addImage(logoDataUrl, 'PNG', margin - 3, 8, 40, 17);
                } catch (e) {
                    console.warn('No se pudo insertar el logo en el PDF:', e);
                }
            }

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('HOSPITAL DE ESPECIALIDADES PORTOVIEJO', textX, 13);

            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(linea1, textX, 21);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(linea2, textX, 28);

            doc.setFontSize(8);
            doc.text(subtitulo, textX, 34);

            yPos = 44;
        }

        // Función para dibujar sección
        function drawSection(title, y) {
            doc.setFillColor(11, 47, 92);
            doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 4, y + 5.5);
            return y + 12;
        }

        // Función para dibujar tabla simple
        function drawTable(headers, rows, startY) {
            let y = startY;
            const colWidths = [];
            const numCols = headers.length;
            const availWidth = pageWidth - margin * 2;
            headers.forEach(() => colWidths.push(availWidth / numCols));

            doc.setFillColor(240, 240, 240);
            doc.rect(margin, y, availWidth, 7, 'F');
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            let x = margin + 2;
            headers.forEach((h, i) => {
                doc.text(h, x, y + 5);
                x += colWidths[i];
            });
            y += 7;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            rows.forEach(row => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = margin;
                }
                doc.setTextColor(60, 60, 60);
                x = margin + 2;
                row.forEach((cell, i) => {
                    doc.text(String(cell), x, y + 4);
                    x += colWidths[i];
                });
                y += 6;
            });

            return y + 4;
        }

        // ---- PÁGINA 1: RESUMEN ----
        drawHeader();
        const data = await fetchReportData(fechaInicio, fechaFin);

        // Tarjetas de KPI
        yPos = drawSection('RESUMEN GENERAL DE INDICADORES', yPos);
        const kpiCards = [
            ['Atendidos en Triage', data.resumen.total_atendidos.toString()],
            ['Pendientes de Triage', data.resumen.total_pendientes.toString()],
            ['Tiempo Total Promedio', `${data.resumen.avg_total_triage} min`]
        ];

        const cardWidth = (pageWidth - margin * 2 - 10) / 3;
        kpiCards.forEach((card, i) => {
            const x = margin + i * (cardWidth + 3.3);
            doc.setFillColor(245, 247, 250);
            doc.roundedRect(x, yPos, cardWidth, 20, 3, 3, 'F');
            doc.setTextColor(11, 47, 92);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(card[1], x + cardWidth / 2, yPos + 10, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(card[0], x + cardWidth / 2, yPos + 16, { align: 'center' });
        });
        yPos += 28;

        // Tiempos promedio
        yPos = drawSection('TIEMPOS PROMEDIO POR ETAPA (Minutos)', yPos);
        const tiemposRows = [
            ['Espera de Signos Vitales', `${data.resumen.avg_espera_signos} min`],
            ['Toma de Signos Vitales', `${data.resumen.avg_duracion_signos} min`],
            ['Espera de Triage', `${data.resumen.avg_espera_triage} min`],
            ['Duración de Triage', `${data.resumen.avg_duracion_triage} min`],
            ['Tiempo Total de Proceso', `${data.resumen.avg_total_triage} min`]
        ];
        yPos = drawTable(['Etapa', 'Tiempo Promedio'], tiemposRows, yPos);
        yPos += 4;

        // Prioridad de triage
        yPos = drawSection('DISTRIBUCIÓN POR PRIORIDAD DE TRIAGE', yPos);
        const prioridadRows = unificarPrioridades(data.prioridades).map(p => [p[0], p[1].toString()]);
        yPos = drawTable(['Prioridad', 'Total de Pacientes'], prioridadRows, yPos);

        // ---- PÁGINA 2: PRODUCTIVIDAD Y TENDENCIAS ----
        doc.addPage();
        drawHeader();

        yPos = drawSection('PRODUCTIVIDAD - TOMA DE SIGNOS VITALES', yPos);
        const signosRows = data.productividad.signos_vitales.map(p => [p.personal, p.cantidad.toString()]);
        yPos = drawTable(['Nombre del Profesional', 'Pacientes Atendidos'], signosRows, yPos);
        yPos += 4;

        yPos = drawSection('PRODUCTIVIDAD - EVALUACIÓN DE TRIAGE', yPos);
        const triageRows = data.productividad.triage.map(p => [p.personal, p.cantidad.toString()]);
        yPos = drawTable(['Nombre del Profesional', 'Pacientes Atendidos'], triageRows, yPos);
        yPos += 4;

        if (yPos > pageHeight - 60) {
            doc.addPage();
            drawHeader();
        }
        yPos = drawSection('ADMISIONES POR HORA DEL DÍA', yPos);
        const horaRows = data.tendenciaHora
            .filter(h => h.cantidad > 0)
            .map(h => [`${h.hora.toString().padStart(2, '0')}:00`, h.cantidad.toString()]);
        yPos = drawTable(['Hora', 'Pacientes Admitidos'], horaRows, yPos);

        // ---- PIE DE PÁGINA ----
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `© ${new Date().getFullYear()} Hospital de Especialidades Portoviejo - Generado: ${new Date().toLocaleString('es-ES')}`,
                pageWidth / 2,
                pageHeight - 8,
                { align: 'center' }
            );
        }

        const fileName = getNombreArchivo(periodoActivo, 'pdf');
        doc.save(fileName);

        return true;
    } catch (error) {
        console.error('Error al exportar PDF:', error);
        alert('Error al generar el archivo PDF. Verifique la conexión al servidor.');
        return false;
    } finally {
        mostrarLoadingExport(false);
    }
}

function mostrarLoadingExport(cargando) {
    const btnExcel = document.getElementById('btnExportExcel');
    const btnPDF = document.getElementById('btnExportPDF');
    if (btnExcel) {
        btnExcel.disabled = cargando;
        btnExcel.textContent = cargando ? 'Generando...' : '📊 Exportar Excel';
    }
    if (btnPDF) {
        btnPDF.disabled = cargando;
        btnPDF.textContent = cargando ? 'Generando...' : '📄 Exportar PDF';
    }
}
