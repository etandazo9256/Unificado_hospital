-- ============================================================
-- HEP Dashboard - Hospital de Especialidades Portoviejo
-- Esquema de base de datos (Supabase / PostgreSQL)
-- Esquema: esq_emergencia
-- ============================================================

CREATE SCHEMA IF NOT EXISTS esq_emergencia;

-- ------------------------------------------------------------
-- Secuencia para la columna id (reporte_emergencia)
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS esq_emergencia.reporte_emergencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- Tabla principal: reporte_emergencia
-- Tabla de turnos y atencion de pacientes del area de emergencia
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS esq_emergencia.reporte_emergencia (
    id                             integer NOT NULL DEFAULT nextval('esq_emergencia.reporte_emergencia_id_seq'::regclass),
    numero                         integer,
    fecha_turno                    timestamp without time zone,
    fecha_llamado                  timestamp without time zone,
    fecha_sig_vitales              timestamp without time zone,
    resp_sig_vitales               character varying,
    fecha_triage                   timestamp without time zone,
    resp_triage                    character varying,
    turno                          character varying,
    paciente                       character varying,
    fecha_ing_observacion          timestamp without time zone,
    fecha_soli_hosp                timestamp without time zone,
    fecha_ing_hospitalizacion      timestamp without time zone,
    tiempo_espera_turno_signos     character varying,
    tiempo_duracion_signos_vitales character varying,
    tiempo_espera_signos_triage    character varying,
    tiempo_duracion_triage         character varying,
    tiempo_total_turno_triage      character varying,
    prioridad                      character varying,
    atendido                       boolean DEFAULT false,
    estado                         character varying DEFAULT 'pendiente'::character varying,
    fecha_inicio_triage            timestamp without time zone,
    fecha_fin_triage               timestamp without time zone,
    fecha_inicio_atencion_medica   timestamp without time zone,
    fecha_fin_atencion_medica      timestamp without time zone,
    medico_responsable             character varying,
    consultorio                    character varying,
    observacion_estado             text
);

-- ------------------------------------------------------------
-- Restriccion de estados validos del turno
-- ------------------------------------------------------------
ALTER TABLE ONLY esq_emergencia.reporte_emergencia
    ADD CONSTRAINT chk_reporte_emergencia_estado
    CHECK (((estado)::text = ANY ((ARRAY[
        'pendiente'::character varying,
        'llamado'::character varying,
        'en_triage'::character varying,
        'pendiente_medico'::character varying,
        'en_atencion_medica'::character varying,
        'finalizado'::character varying,
        'no_asiste'::character varying,
        'cancelado'::character varying
    ])::text[])));

-- ------------------------------------------------------------
-- Indices para consultas frecuentes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_fecha_turno
    ON esq_emergencia.reporte_emergencia USING btree (fecha_turno);

CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_estado
    ON esq_emergencia.reporte_emergencia USING btree (estado);

CREATE INDEX IF NOT EXISTS idx_reporte_emergencia_estado_fecha_turno
    ON esq_emergencia.reporte_emergencia USING btree (estado, fecha_turno);

CREATE INDEX IF NOT EXISTS idx_atendido_fecha
    ON esq_emergencia.reporte_emergencia USING btree (atendido, fecha_turno);