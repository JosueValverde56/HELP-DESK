'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '@/src/services/auth.service'
import styles from './page.module.css';

// ── Validación Zod ────────────────────────────────────────────────────────────
const schema = z.object({
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Correo electrónico inválido'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(6, 'Mínimo 6 caracteres'),
});

type LoginForm = z.infer<typeof schema>;

// ── Componente ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const result = await authService.login({ email: data.email, password: data.password });
      if (result?.ok) {
        router.push('/dashboard');
      } else {
        setServerError('Correo electrónico o contraseña incorrectos');
      }
    } catch {
      setServerError('No se pudo conectar con el servidor. Intenta de nuevo.');
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />

      <div className={styles.card}>
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.logoBadge}>
            <Shield size={20} strokeWidth={1.5} />
          </div>
          <div className={styles.headerText}>
            <span className={styles.systemLabel}>SISTEMA HELPDESK</span>
            <h1 className={styles.title}>Iniciar Sesión</h1>
            <p className={styles.subtitle}>Acceso restringido al personal autorizado</p>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
          {/* Email */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="usuario@empresa.com"
              className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
              {...register('email')}
            />
            {errors.email && (
              <span className={styles.fieldError}>
                <AlertCircle size={12} />
                {errors.email.message}
              </span>
            )}
          </div>

          {/* Contraseña */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Contraseña
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                {...register('password')}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && (
              <span className={styles.fieldError}>
                <AlertCircle size={12} />
                {errors.password.message}
              </span>
            )}
          </div>

          {/* Error servidor */}
          {serverError && (
            <div className={styles.serverError}>
              <AlertCircle size={14} />
              {serverError}
            </div>
          )}

          {/* Botón */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitBtn}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className={styles.spin} />
                Verificando...
              </>
            ) : (
              'Acceder al Sistema'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <Link href="/forgot-password" style={{ color: '#60a5fa', fontSize: '0.78rem', textDecoration: 'none' }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <p className={styles.footer}>
          Acceso monitorizado · Solo personal autorizado
        </p>
      </div>
    </div>
  );
}