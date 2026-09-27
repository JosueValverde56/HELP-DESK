-- ============================================================
-- MIGRACIÓN: Gestión de Departamentos
-- GAD Municipal de Pelileo — Helpdesk
-- ============================================================

-- 1. Tabla de departamentos
CREATE TABLE HD_DEPARTAMENTOS (
  ID_DEPARTAMENTO  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  NOMBRE           VARCHAR2(150)  NOT NULL,
  DESCRIPCION      VARCHAR2(300),
  ESTADO           VARCHAR2(10)   DEFAULT 'ACTIVO' NOT NULL
                     CHECK (ESTADO IN ('ACTIVO','INACTIVO')),
  FECHA_CREACION   TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

-- 2. Índice único en nombre
CREATE UNIQUE INDEX UQ_DEPTO_NOMBRE ON HD_DEPARTAMENTOS (NOMBRE);

-- 3. FK en usuarios
ALTER TABLE HD_USUARIOS
  ADD (ID_DEPARTAMENTO NUMBER);

ALTER TABLE HD_USUARIOS
  ADD CONSTRAINT FK_USR_DEPTO
    FOREIGN KEY (ID_DEPARTAMENTO)
    REFERENCES HD_DEPARTAMENTOS (ID_DEPARTAMENTO);

-- 4. Departamentos del GAD Municipal de Pelileo
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de TI');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Talento Humano');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Secretaría General');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Asesoría Jurídica');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Dirección Financiera');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Obras Públicas');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Planificación Territorial');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Avalúos y Catastros');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Gestión Ambiental');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Comisaría Municipal');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Departamento de Desarrollo Social');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Camal Municipal de Pelileo');
INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES ('Mercado República de Argentina');

COMMIT;
