BEGIN;

-- Eliminar el CHECK constraint anterior
ALTER TABLE esq_emergencia.reporte_emergencia
    DROP CONSTRAINT IF EXISTS chk_reporte_emergencia_estado;

-- Crear nuevo CHECK constraint con prioridades Manchester
ALTER TABLE esq_emergencia.reporte_emergencia
    ADD CONSTRAINT chk_reporte_emergencia_estado
    CHECK (estado IN (
        'pendiente',
        'llamado',
        'en_triage',
        'pendiente_medico',
        'en_atencion_medica',
        'finalizado',
        'no_asiste',
        'cancelado'
    ));

-- Eliminar CHECK constraint de prioridad si existe
ALTER TABLE esq_emergencia.reporte_emergencia
    DROP CONSTRAINT IF EXISTS chk_reporte_emergencia_prioridad;

-- Crear nuevo CHECK constraint con prioridades Manchester
ALTER TABLE esq_emergencia.reporte_emergencia
    ADD CONSTRAINT chk_reporte_emergencia_prioridad
    CHECK (prioridad IS NULL OR prioridad IN (
        'P1-RESUCITACION',
        'P2-EMERGENCIA',
        'P3-URGENCIA',
        'P4-MENOS_URGENTE',
        'P5-NO_URGENTE',
        'SIN CLASIFICAR'
    ));

-- Migrar datos existentes de prioridades antiguas a Manchester
UPDATE esq_emergencia.reporte_emergencia
SET prioridad = CASE prioridad
    WHEN 'ROJO' THEN 'P1-RESUCITACION'
    WHEN 'AMARILLO' THEN 'P3-URGENCIA'
    WHEN 'VERDE' THEN 'P4-MENOS_URGENTE'
    ELSE 'SIN CLASIFICAR'
END
WHERE prioridad IN ('ROJO', 'AMARILLO', 'VERDE');

COMMIT;
