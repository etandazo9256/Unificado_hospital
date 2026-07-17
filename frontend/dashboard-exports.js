// dashboard-exports.js
// Exportación Excel y PDF - HEP Portoviejo

const API_BASE = '/api';

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

function getPeriodoLabel(fechaInicio, fechaFin) {
    if (fechaInicio && fechaFin) {
        return `${formatFecha(fechaInicio)} al ${formatFecha(fechaFin)}`;
    } else if (fechaInicio) {
        return `Desde ${formatFecha(fechaInicio)}`;
    } else if (fechaFin) {
        return `Hasta ${formatFecha(fechaFin)}`;
    }
    return 'Todos los registros';
}

// ==================== EXPORTAR EXCEL ====================
async function exportarExcel(fechaInicio, fechaFin) {
    try {
        const data = await fetchReportData(fechaInicio, fechaFin);
        const periodo = getPeriodoLabel(fechaInicio, fechaFin);

        const wb = XLSX.utils.book_new();

        // Hoja 1: Resumen de KPIs
        const resumenData = [
            ['HOSPITAL DE ESPECIALIDADES PORTOVIEJO'],
            ['Dashboard de Indicadores KPI - Área de Emergencia'],
            [''],
            ['Período:', periodo],
            ['Fecha de exportación:', new Date().toLocaleString('es-ES')],
            [''],
            ['RESUMEN GENERAL'],
            ['Indicador', 'Valor'],
            ['Pacientes Registrados', data.resumen.total_pacientes],
            ['Atendidos en Triage', data.resumen.total_atendidos],
            ['Pendientes de Triage', data.resumen.total_pendientes],
            ['Pacientes en Triage', data.resumen.en_triage],
            ['Pendientes de Médico', data.resumen.pendiente_medico],
            ['En Atención Médica', data.resumen.en_atencion_medica],
            [''],
            ['TIEMPOS PROMEDIO (Minutos)'],
            ['Tiempo Espera de Signos Vitales', data.resumen.avg_espera_signos],
            ['Duración Toma de Signos Vitales', data.resumen.avg_duracion_signos],
            ['Tiempo Espera de Triage', data.resumen.avg_espera_triage],
            ['Duración de Triage', data.resumen.avg_duracion_triage],
            ['Tiempo Total de Proceso', data.resumen.avg_total_triage]
        ];
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        wsResumen['!cols'] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen KPIs');

        // Hoja 2: Distribución por Prioridad
        const prioridadData = [
            ['DISTRIBUCIÓN POR PRIORIDAD DE TRIAGE'],
            [''],
            ['Prioridad', 'Cantidad']
        ];
        data.prioridades.forEach(p => {
            prioridadData.push([p.prioridad, p.cantidad]);
        });
        const wsPrioridad = XLSX.utils.aoa_to_sheet(prioridadData);
        wsPrioridad['!cols'] = [{ wch: 25 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsPrioridad, 'Prioridad Triage');

        // Hoja 3: Productividad del Personal
        const prodData = [
            ['PRODUCTIVIDAD DEL PERSONAL'],
            [''],
            ['TOMA DE SIGNOS VITALES'],
            ['Personal', 'Pacientes Atendidos']
        ];
        data.productividad.signos_vitales.forEach(p => {
            prodData.push([p.personal, p.cantidad]);
        });
        prodData.push(['']);
        prodData.push(['EVALUACIÓN DE TRIAGE']);
        prodData.push(['Personal', 'Pacientes Atendidos']);
        data.productividad.triage.forEach(p => {
            prodData.push([p.personal, p.cantidad]);
        });
        const wsProd = XLSX.utils.aoa_to_sheet(prodData);
        wsProd['!cols'] = [{ wch: 35 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsProd, 'Productividad');

        // Hoja 4: Tendencia por Hora
        const horaData = [
            ['DISTRIBUCIÓN DE ADMISIONES POR HORA'],
            [''],
            ['Hora', 'Cantidad de Pacientes']
        ];
        data.tendenciaHora.forEach(h => {
            horaData.push([`${h.hora.toString().padStart(2, '0')}:00`, h.cantidad]);
        });
        const wsHora = XLSX.utils.aoa_to_sheet(horaData);
        wsHora['!cols'] = [{ wch: 15 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsHora, 'Tendencia por Hora');

        // Hoja 5: Evolución Diaria
        const fechaData = [
            ['EVOLUCIÓN DIARIA DE ADMISIONES'],
            [''],
            ['Fecha', 'Pacientes', 'Tiempo Prom. Triage (min)']
        ];
        data.tendenciaFecha.forEach(f => {
            fechaData.push([formatFecha(f.fecha), f.cantidad, f.avg_total_triage]);
        });
        const wsFecha = XLSX.utils.aoa_to_sheet(fechaData);
        wsFecha['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsFecha, 'Evolución Diaria');

        // Descargar archivo
        const fileName = `Reporte_KPI_Hospital_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        return true;
    } catch (error) {
        console.error('Error al exportar Excel:', error);
        alert('Error al generar el archivo Excel. Verifique la conexión al servidor.');
        return false;
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

        // Función auxiliar para encabezado
        function drawHeader() {
            // Fondo del encabezado
            doc.setFillColor(11, 47, 92);
            doc.rect(0, 0, pageWidth, 35, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('HOSPITAL DE ESPECIALIDADES PORTOVIEJO', pageWidth / 2, 14, { align: 'center' });

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text('Dashboard de Indicadores KPI - Área de Emergencia', pageWidth / 2, 22, { align: 'center' });

            doc.setFontSize(9);
            const periodo = getPeriodoLabel(fechaInicio, fechaFin);
            doc.text(`Período: ${periodo}`, pageWidth / 2, 30, { align: 'center' });

            yPos = 42;
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

            // Encabezados
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

            // Filas
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
            ['Pacientes Registrados', data.resumen.total_pacientes.toString()],
            ['Atendidos en Triage', data.resumen.total_atendidos.toString()],
            ['Pendientes de Triage', data.resumen.total_pendientes.toString()],
            ['Tiempo Total Promedio', `${data.resumen.avg_total_triage} min`]
        ];

        const cardWidth = (pageWidth - margin * 2 - 10) / 4;
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
        const prioridadRows = data.prioridades.map(p => [p.prioridad, p.cantidad.toString()]);
        yPos = drawTable(['Prioridad', 'Cantidad de Pacientes'], prioridadRows, yPos);

        // ---- PÁGINA 2: PRODUCTIVIDAD Y TENDENCIAS ----
        doc.addPage();
        drawHeader();

        // Productividad Signos Vitales
        yPos = drawSection('PRODUCTIVIDAD - TOMA DE SIGNOS VITALES', yPos);
        const signosRows = data.productividad.signos_vitales.map(p => [p.personal, p.cantidad.toString()]);
        yPos = drawTable(['Nombre del Profesional', 'Pacientes Atendidos'], signosRows, yPos);
        yPos += 4;

        // Productividad Triage
        yPos = drawSection('PRODUCTIVIDAD - EVALUACIÓN DE TRIAGE', yPos);
        const triageRows = data.productividad.triage.map(p => [p.personal, p.cantidad.toString()]);
        yPos = drawTable(['Nombre del Profesional', 'Pacientes Atendidos'], triageRows, yPos);
        yPos += 4;

        // Tendencia por hora
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

        // Descargar
        const fileName = `Reporte_KPI_Hospital_${new Date().toISOString().slice(0, 10)}.pdf`;
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
        btnExcel.textContent = cargando ? 'Generando...' : 'Exportar Excel';
    }
    if (btnPDF) {
        btnPDF.disabled = cargando;
        btnPDF.textContent = cargando ? 'Generando...' : 'Exportar PDF';
    }
}
