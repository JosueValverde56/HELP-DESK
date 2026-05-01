-- =====================================================
-- MIGRACIÓN V5: Estado REABIERTO + columna SLA_ALERTA_ENVIADA
-- =====================================================

ALTER SESSION SET "_ORACLE_SCRIPT"=true;

-- 1. Agregar REABIERTO a la constraint CHECK del estado del ticket
--    (busca y elimina la constraint existente, luego la recrea)
DECLARE
  v_cons VARCHAR2(100);
BEGIN
  SELECT CONSTRAINT_NAME INTO v_cons
  FROM ALL_CONSTRAINTS
  WHERE OWNER = 'HELPDESK'
    AND TABLE_NAME = 'HD_TICKETS'
    AND CONSTRAINT_TYPE = 'C'
    AND SEARCH_CONDITION LIKE '%ESTADO%'
    AND ROWNUM = 1;
  EXECUTE IMMEDIATE 'ALTER TABLE HELPDESK.HD_TICKETS DROP CONSTRAINT ' || v_cons;
EXCEPTION
  WHEN NO_DATA_FOUND THEN NULL;  -- No hay constraint, continuar sin error
END;
/

ALTER TABLE HELPDESK.HD_TICKETS ADD CONSTRAINT chk_ticket_estado
  CHECK (ESTADO IN ('ABIERTO','EN_PROGRESO','RESUELTO','CERRADO','REABIERTO'));

-- 2. Columna para evitar spam de alertas SLA (1 = alerta ya enviada)
ALTER TABLE HELPDESK.HD_TICKETS ADD SLA_ALERTA_ENVIADA NUMBER(1) DEFAULT 0 NOT NULL;

-- 3. Verificar resultado
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
FROM ALL_TAB_COLUMNS
WHERE OWNER = 'HELPDESK' AND TABLE_NAME = 'HD_TICKETS'
ORDER BY COLUMN_ID;

EXIT;
