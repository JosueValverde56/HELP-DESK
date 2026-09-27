import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECTION_STRING,
};

export async function initializeDB() {
  try {
    await oracledb.createPool({
      ...dbConfig,
      poolMin:          2,
      poolMax:          20,
      poolIncrement:    2,
      poolTimeout:      60,
      poolPingInterval: 60,
      stmtCacheSize:    30,
      queueMax:         50,
      queueTimeout:     10000,
    });
    console.log('✅ Pool de conexiones a Oracle listo (Modo Thin)');
    await runMigrations();
  } catch (err: any) {
    console.error('❌ Error al inicializar el Pool de Oracle:', err.message || err);
    process.exit(1);
  }
}

async function tableExists(conn: oracledb.Connection, name: string): Promise<boolean> {
  const r = await conn.execute(
    `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :n`,
    { n: name },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (r.rows as any[])[0].CNT > 0;
}

async function columnExists(conn: oracledb.Connection, table: string, col: string): Promise<boolean> {
  const r = await conn.execute(
    `SELECT COUNT(*) AS CNT FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t AND COLUMN_NAME = :c`,
    { t: table, c: col },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (r.rows as any[])[0].CNT > 0;
}


async function waitForOracle(maxAttempts = 12, delayMs = 10000): Promise<oracledb.Connection> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const conn = await oracledb.getConnection();
      await conn.execute('SELECT 1 FROM DUAL');
      return conn;
    } catch (err: any) {
      const code = err.errorNum ?? err.code;
      const isStarting = code === 1033 || code === 1034 || code === 1089 || String(err.message).includes('ORA-01033');
      if (!isStarting || i === maxAttempts) throw err;
      console.log(`⏳ Oracle aún iniciando (intento ${i}/${maxAttempts}), reintentando en ${delayMs / 1000}s...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Oracle no respondió después de los reintentos');
}

async function runMigrations() {
  let connection;
  try {
    connection = await waitForOracle();

    // ── HD_DEPARTAMENTOS ──────────────────────────────────────────────────────
    if (!(await tableExists(connection, 'HD_DEPARTAMENTOS'))) {
      await connection.execute(`
        CREATE TABLE HD_DEPARTAMENTOS (
          ID_DEPARTAMENTO  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          NOMBRE           VARCHAR2(150)  NOT NULL,
          DESCRIPCION      VARCHAR2(300),
          ESTADO           VARCHAR2(10)   DEFAULT 'ACTIVO' NOT NULL
                             CHECK (ESTADO IN ('ACTIVO','INACTIVO')),
          FECHA_CREACION   TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
        )`);
      await connection.execute(`CREATE UNIQUE INDEX UQ_DEPTO_NOMBRE ON HD_DEPARTAMENTOS (NOMBRE)`);
      console.log('✅ Tabla HD_DEPARTAMENTOS creada');
    }

    // ── FK ID_DEPARTAMENTO en HD_USUARIOS ────────────────────────────────────
    if (!(await columnExists(connection, 'HD_USUARIOS', 'ID_DEPARTAMENTO'))) {
      await connection.execute(`ALTER TABLE HD_USUARIOS ADD (ID_DEPARTAMENTO NUMBER)`);
      await connection.execute(
        `ALTER TABLE HD_USUARIOS ADD CONSTRAINT FK_USR_DEPTO
           FOREIGN KEY (ID_DEPARTAMENTO) REFERENCES HD_DEPARTAMENTOS (ID_DEPARTAMENTO)`
      );
      console.log('✅ Columna ID_DEPARTAMENTO agregada a HD_USUARIOS');
    }

    // ── Seed departamentos GAD Municipal de Pelileo ───────────────────────────
    const countDep = await connection.execute(
      `SELECT COUNT(*) AS CNT FROM HD_DEPARTAMENTOS`, {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((countDep.rows as any[])[0].CNT === 0) {
      const departamentos = [
        'Departamento de TI', 'Departamento de Talento Humano', 'Secretaría General',
        'Asesoría Jurídica', 'Departamento de Dirección Financiera',
        'Departamento de Obras Públicas', 'Departamento de Planificación Territorial',
        'Departamento de Avalúos y Catastros', 'Departamento de Gestión Ambiental',
        'Departamento de Comisaría Municipal', 'Departamento de Desarrollo Social',
        'Camal Municipal de Pelileo', 'Mercado República de Argentina',
      ];
      for (const nombre of departamentos)
        await connection.execute(`INSERT INTO HD_DEPARTAMENTOS (NOMBRE) VALUES (:nombre)`, { nombre });
      await connection.commit();
      console.log(`✅ ${departamentos.length} departamentos del GAD Municipal de Pelileo registrados`);
    }

    // ── ESTADO en HD_CATEGORIAS ───────────────────────────────────────────────
    if (!(await columnExists(connection, 'HD_CATEGORIAS', 'ESTADO'))) {
      await connection.execute(`ALTER TABLE HD_CATEGORIAS ADD (ESTADO VARCHAR2(10) DEFAULT 'ACTIVO' NOT NULL)`);
      console.log('✅ Columna ESTADO agregada a HD_CATEGORIAS');
    }

    // ── HD_SLA_CONFIG ─────────────────────────────────────────────────────────
    if (!(await tableExists(connection, 'HD_SLA_CONFIG'))) {
      await connection.execute(`
        CREATE TABLE HD_SLA_CONFIG (
          ID_SLA_CONFIG  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          PRIORIDAD      VARCHAR2(10) NOT NULL CHECK (PRIORIDAD IN ('ALTA','MEDIA','BAJA')),
          HORAS_LIMITE   NUMBER(6,2)  NOT NULL,
          ACTUALIZADO_POR NUMBER,
          FECHA_ACT      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
          CONSTRAINT UQ_SLA_PRIO UNIQUE (PRIORIDAD)
        )`);
      await connection.execute(`INSERT INTO HD_SLA_CONFIG (PRIORIDAD, HORAS_LIMITE) VALUES ('ALTA',  4)`);
      await connection.execute(`INSERT INTO HD_SLA_CONFIG (PRIORIDAD, HORAS_LIMITE) VALUES ('MEDIA', 24)`);
      await connection.execute(`INSERT INTO HD_SLA_CONFIG (PRIORIDAD, HORAS_LIMITE) VALUES ('BAJA',  72)`);
      await connection.commit();
      console.log('✅ Tabla HD_SLA_CONFIG creada con valores por defecto');
    }

    // ── HD_ANYDESK_DEPARTAMENTOS ──────────────────────────────────────────────
    if (!(await tableExists(connection, 'HD_ANYDESK_DEPARTAMENTOS'))) {
      await connection.execute(`
        CREATE TABLE HD_ANYDESK_DEPARTAMENTOS (
          ID_ANYDESK        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ID_DEPARTAMENTO   NUMBER NOT NULL,
          CODIGO_ANYDESK    VARCHAR2(50),
          ACTUALIZADO_POR   NUMBER,
          FECHA_ACTUALIZACION TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
          CONSTRAINT FK_ANYD_DEPTO FOREIGN KEY (ID_DEPARTAMENTO)
            REFERENCES HD_DEPARTAMENTOS (ID_DEPARTAMENTO)
        )`);
      // Seed: un registro por cada departamento existente
      await connection.execute(`
        INSERT INTO HD_ANYDESK_DEPARTAMENTOS (ID_DEPARTAMENTO)
        SELECT ID_DEPARTAMENTO FROM HD_DEPARTAMENTOS`);
      await connection.commit();
      console.log('✅ Tabla HD_ANYDESK_DEPARTAMENTOS creada');
    }

    // ── PASSWORD_ANYDESK column ───────────────────────────────────────────────
    if (!(await columnExists(connection, 'HD_ANYDESK_DEPARTAMENTOS', 'PASSWORD_ANYDESK'))) {
      await connection.execute(
        `ALTER TABLE HD_ANYDESK_DEPARTAMENTOS ADD (PASSWORD_ANYDESK VARCHAR2(100))`
      );
      console.log('✅ Columna PASSWORD_ANYDESK agregada a HD_ANYDESK_DEPARTAMENTOS');
    }

    // ── Drop HD_CONOCIMIENTO (feature removed) ───────────────────────────────
    if (await tableExists(connection, 'HD_CONOCIMIENTO')) {
      await connection.execute(`DROP TABLE HD_CONOCIMIENTO`);
      console.log('✅ Tabla HD_CONOCIMIENTO eliminada');
    }

    // ── HD_ANYDESK_LOG (auditoría de conexiones) ─────────────────────────────
    if (!(await tableExists(connection, 'HD_ANYDESK_LOG'))) {
      await connection.execute(`
        CREATE TABLE HD_ANYDESK_LOG (
          ID_LOG          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ID_ANYDESK      NUMBER NOT NULL,
          ID_USUARIO      NUMBER NOT NULL,
          FECHA_CONEXION  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
          CONSTRAINT FK_LOG_ANYDESK  FOREIGN KEY (ID_ANYDESK) REFERENCES HD_ANYDESK_DEPARTAMENTOS (ID_ANYDESK),
          CONSTRAINT FK_LOG_USUARIO  FOREIGN KEY (ID_USUARIO) REFERENCES HD_USUARIOS (ID_USUARIO)
        )`);
      await connection.execute(`CREATE INDEX IX_ANYDESK_LOG_FECHA ON HD_ANYDESK_LOG (FECHA_CONEXION)`);
      console.log('✅ Tabla HD_ANYDESK_LOG creada');
    }

    // ── HD_RESET_TOKENS ───────────────────────────────────────────────────────
    if (!(await tableExists(connection, 'HD_RESET_TOKENS'))) {
      await connection.execute(`
        CREATE TABLE HD_RESET_TOKENS (
          ID_TOKEN     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ID_USUARIO   NUMBER        NOT NULL,
          TOKEN        VARCHAR2(128) NOT NULL,
          EXPIRA_EN    TIMESTAMP     NOT NULL,
          USADO        NUMBER(1)     DEFAULT 0 NOT NULL,
          FECHA_CREACION TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
          CONSTRAINT UQ_RESET_TOKEN UNIQUE (TOKEN)
        )`);
      console.log('✅ Tabla HD_RESET_TOKENS creada');
    }

  } catch (err: any) {
    console.error('⚠️  Migración falló:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}
