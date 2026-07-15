BEGIN;

ALTER TABLE esq_emergencia.reporte_emergencia
    ADD COLUMN IF NOT EXISTS estado varchar(30),
    ADD COLUMN IF NOT EXISTS fecha_inicio_triage timestamp,
    ADD COLUMN IF NOT EXISTS fecha_fin_triage timestamp,
    ADD COLUMN IF NOT EXISTS fecha_inicio_atencion_medica timestamp,
    ADD COLUMN IF NOT EXISTS fecha_fin_atencion_medica timestamp,
    ADD COLUMN IF NOT EXISTS medico_responsable varchar(150),
    ADD COLUMN IF NOT EXISTS consultorio varchar(50),
    ADD COLUMN IF NOT EXISTS observacion_estado text;

UPDATE esq_emergencia.reporte_emergencia
SET estado = CASE
    WHEN atendido = true THEN 'finalizado'
    ELSE 'pendiente'
END
WHERE estado IS NULL;

ALTER TABLE esq_emergencia.reporte_emergencia
    ALTER COLUMN estado SET DEFAULT 'pendiente';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_reporte_emergencia_estado'
          AND conrelid = 'esq_emergencia.reporte_emergencia'::regclass
    ) THEN
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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_estado
    ON esq_emergencia.reporte_emergencia (estado);

CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_fecha_turno
    ON esq_emergencia.reporte_emergencia (fecha_turno);

CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_estado_fecha_turno
    ON esq_emergencia.reporte_emergencia (estado, fecha_turno);

COMMIT;
