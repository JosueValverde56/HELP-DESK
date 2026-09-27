# HELP-DESK
🎫 Sistema Help Desk para la gestión de tickets de soporte técnico, permitiendo registrar, asignar, dar seguimiento y controlar solicitudes de los usuarios.

Este repositorio contiene el código fuente del sistema de Helpdesk. El proyecto está dividido en dos aplicaciones principales: un Backend (Node.js/TypeScript con integración a WhatsApp) y un Frontend (Next.js con Tailwind CSS).
📋 Requisitos Previos
Antes de comenzar, asegúrate de tener instalado lo siguiente en tu entorno local:
●	Node.js (Versión 18 o superior recomendada)
●	Docker y Docker Compose (Para levantar la base de datos o servicios externos locales)
●	Git
●	Un gestor de paquetes como npm, yarn o pnpm.
🚀 Guía de Inicio Rápido (Local)
Sigue estos pasos para ejecutar el proyecto en tu máquina local.
1. Clonar el repositorio
git clone https://github.com/tu-usuario/helpdesk-tesis.git
cd helpdesk-tesis-main

2. Levantar los servicios de infraestructura (Docker)
El proyecto incluye un archivo docker-compose.dev.yml para el entorno de desarrollo (probablemente para la base de datos PostgreSQL/MySQL/Redis, etc.).
docker-compose -f docker-compose.dev.yml up -d

Nota: Asegúrate de que Docker esté corriendo en tu sistema antes de ejecutar este comando.
3. Configuración y ejecución del Backend
El backend gestiona la lógica de negocio y la conexión con WhatsApp Web (whatsapp-web.js).
Paso 3.1: Navegar e instalar dependencias
cd backend
npm install

Paso 3.2: Variables de entorno
Copia el archivo de ejemplo para crear tus propias variables de entorno locales.
cp .env.example .env

Abre el archivo .env en tu editor de código y configura las credenciales de la base de datos y puertos según corresponda con tu Docker.
Paso 3.3: Iniciar el servidor de desarrollo
npm run dev

(Si es la primera vez que lo corres y usas WhatsApp Web, probablemente debas escanear un código QR en la terminal).
4. Configuración y ejecución del Frontend
El frontend está construido con Next.js y consume los servicios del backend.
Paso 4.1: Abrir una nueva terminal y navegar al frontend
cd frontend
npm install

Paso 4.2: Variables de entorno
Asegúrate de crear y configurar tu archivo de variables locales.
# Crea el archivo .env.local basándote en la configuración necesaria
touch .env.local

Añade la URL del backend (ej: NEXT_PUBLIC_API_URL=http://localhost:3000) al archivo .env.local.
Paso 4.3: Iniciar el entorno de desarrollo
npm run dev

La aplicación web debería estar ahora corriendo, típicamente en http://localhost:3001 (o el puerto que Next.js haya asignado si el 3000 está ocupado por el backend).
📁 Estructura del Proyecto
●	/backend: API RESTful en Node.js + TypeScript, configuración de WhatsApp Web JS y gestión de subidas (/uploads).
●	/frontend: Aplicación web interactiva creada con Next.js (App Router), Tailwind CSS y TypeScript.
●	/db: Archivos relacionados con la base de datos (esquemas, migraciones o semillas).
●	docker-compose.dev.yml: Configuración de contenedores para desarrollo local.
🛠️ Tecnologías Principales
●	Frontend: Next.js, React, Tailwind CSS, TypeScript.
●	Backend: Node.js, TypeScript, WhatsApp Web JS.
●	Infraestructura: Docker.
Nota para el desarrollador: Si la sesión de WhatsApp se desconecta, borra la carpeta backend/.wwebjs_auth y vuelve a iniciar el backend para escanear un nuevo código QR.

