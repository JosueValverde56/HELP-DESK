// src/db/seed.ts
import bcrypt from 'bcrypt';
import oracledb from 'oracledb';
import dotenv from 'dotenv';
import { dbConfig } from './connection.js';

dotenv.config();

async function seedAdmin() {
  let connection;
  try {
    // 1. Abrimos conexión directa
    connection = await oracledb.getConnection(dbConfig);
    
    const emailAdmin = 'admin@helpdesk.com';
    const passwordPlana = 'admin123'; 
    
    // 2. Encriptamos la contraseña con Bcrypt (Estándar de seguridad web)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(passwordPlana, saltRounds);

    // 3. Sentencia SQL con variables "bind" (evita Inyección SQL)
    const sql = `
      INSERT INTO hd_usuarios (email, password_hash, nombre, rol)
      VALUES (:email, :password_hash, :nombre, :rol)
    `;
    
    const binds = {
      email: emailAdmin,
      password_hash: passwordHash,
      nombre: 'Administrador Principal',
      rol: 'ADMIN'
    };

    // 4. Ejecutamos con autoCommit para guardar permanentemente
    await connection.execute(sql, binds, { autoCommit: true });
    
    console.log('✅ Usuario ADMIN creado exitosamente en Oracle.');
    
  } catch (err: any) {
    if (err.errorNum === 1) { // Error ORA-00001: Unique constraint (ya existe)
        console.log('⚠️ El usuario ADMIN ya existe en la base de datos.');
    } else {
        console.error('❌ Error en el seed:', err.message || err);
    }
  } finally {
    if (connection) {
      await connection.close();
    }
    process.exit(0);
  }
}

seedAdmin();