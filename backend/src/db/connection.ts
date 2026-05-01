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
      poolMax:          10,
      poolIncrement:    2,
      poolTimeout:      60,      // Cierra conexiones idle > 60 s
      poolPingInterval: 60,      // Ping cada 60 s para mantener vivas las conexiones
      stmtCacheSize:    30,      // Caché de 30 sentencias por conexión
      queueMax:         50,      // Cola máxima de 50 peticiones antes de rechazar
      queueTimeout:     10000,   // Timeout de cola: 10 s
    });
    console.log('✅ Pool de conexiones a Oracle listo (Modo Thin)');
  } catch (err: any) {
    console.error('❌ Error al inicializar el Pool de Oracle:', err.message || err);
    process.exit(1);
  }
}