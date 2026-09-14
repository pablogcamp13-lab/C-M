import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const LoginScreen: React.FC = () => {
  const { login } = useApp();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(identity.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="cm-login-page">
    <section className="cm-login-brand" aria-label="Calidad y Mejora Continua">
      <svg className="cm-login-brand__network" viewBox="0 0 800 900" fill="none" aria-hidden="true">
        <g stroke="#18ccea" strokeWidth="1"><path d="M0 145h76l86 52L305 12M35 222h150m-25 0 70 74m90-80h214M395 655l122-151 138 58" opacity=".45"/><path d="M0 420h126l60 45m412-227 117-110" opacity=".22"/></g>
        <g fill="#16d9fa"><circle cx="76" cy="145" r="4"/><circle cx="305" cy="12" r="3"/><circle cx="517" cy="504" r="4"/><circle cx="162" cy="197" r="2"/></g>
        <g fill="#1687b4" opacity=".55">{[...Array(24)].map((_, index) => <circle key={index} cx={110 + (index % 8) * 29} cy={195 + Math.floor(index / 8) * 28} r="1.4" />)}</g>
      </svg>
      <div className="cm-login-brand__ring" />
      <div className="cm-login-brand__copy"><div className="cm-login-brand__logo">C<span>&amp;</span>M</div><i/><h1>Calidad y Mejora Continua</h1><p>Estándares altos. Resultados superiores.</p></div>
      <p className="cm-login-brand__legal">© 2026 C&amp;M | Todos los derechos reservados</p>
    </section>

    <section className="cm-login-access">
      <form onSubmit={submit} className="cm-login-card">
        <p className="cm-login-card__eyebrow">Bienvenido</p>
        <h2>Acceso a la plataforma</h2>
        <p className="cm-login-card__intro">Ingresa tus credenciales para continuar.</p>

        <div className="cm-login-fields">
          <label>Correo electrónico o usuario
            <span className="cm-login-field">
              <UserRound aria-hidden="true" />
              <input value={identity} onChange={event => setIdentity(event.target.value)} placeholder="usuario@empresa.com" autoComplete="username" autoFocus required />
            </span>
          </label>
          <label>Contraseña
            <span className="cm-login-field">
              <LockKeyhole aria-hidden="true" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Ingresa tu contraseña" autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button>
            </span>
          </label>
        </div>

        <div className="cm-login-options">
          <label><input checked={remember} onChange={event => setRemember(event.target.checked)} type="checkbox" />Recordarme</label>
          <button type="button">¿Olvidaste tu contraseña?</button>
        </div>
        {error && <p className="cm-login-error" role="alert">{error}</p>}
        <button disabled={loading} className="cm-login-submit"><LogIn />{loading ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <div className="cm-login-protected"><LockKeyhole />Sesión protegida</div>
      </form>
    </section>
  </main>;
};
