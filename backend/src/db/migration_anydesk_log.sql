-- ============================================================
-- MIGRACIÓN: Auditoría de conexiones AnyDesk
-- GAD Municipal de Pelileo — Helpdesk
-- ============================================================
-- Nota: esta migración se aplica automáticamente al iniciar el
-- backend (ver backend/src/db/connection.ts -> runMigrations).
-- Este archivo queda como referencia/documentación.

CREATE TABLE HD_ANYDESK_LOG (
  ID_LOG          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ID_ANYDESK      NUMBER NOT NULL,
  ID_USUARIO      NUMBER NOT NULL,
  FECHA_CONEXION  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT FK_LOG_ANYDESK FOREIGN KEY (ID_ANYDESK) REFERENCES HD_ANYDESK_DEPARTAMENTOS (ID_ANYDESK),
  CONSTRAINT FK_LOG_USUARIO FOREIGN KEY (ID_USUARIO) REFERENCES HD_USUARIOS (ID_USUARIO)
);

CREATE INDEX IX_ANYDESK_LOG_FECHA ON HD_ANYDESK_LOG (FECHA_CONEXION);

COMMIT;
