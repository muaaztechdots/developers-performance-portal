import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="story-glow story-glow-one" />
        <div className="story-glow story-glow-two" />
        <div className="login-story-content">
          <Brand />
          <div className="story-copy">
            <span className="story-kicker"><Sparkles size={15} /> Engineering, in focus</span>
            <h1>Make every day’s<br /><em>progress visible.</em></h1>
            <p>A calm workspace for daily updates, team momentum, and the work that moves your product forward.</p>
          </div>
          <div className="story-preview">
            <div className="preview-head"><span>Today’s pulse</span><span className="live-pill"><i /> Live</span></div>
            <div className="preview-stat"><strong>84%</strong><span>Team check-in</span></div>
            <div className="progress-track"><span /></div>
            <div className="preview-people">
              <span className="mini-avatar coral">AK</span><span className="mini-avatar blue">MS</span><span className="mini-avatar gold">JR</span><span className="mini-avatar green">+8</span>
              <p><CheckCircle2 size={15} /> 11 developers updated</p>
            </div>
          </div>
          <p className="story-foot">Built for teams who ship with clarity.</p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand"><Brand /></div>
          <span className="login-kicker">Welcome back</span>
          <h2>Sign in to your workspace</h2>
          <p className="login-intro">Enter your details to continue to DevPulse.</p>
          <form onSubmit={onSubmit}>
            <label className="field-label" htmlFor="email">Email address</label>
            <div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="password-row"><label className="field-label" htmlFor="password">Password</label><button type="button" className="text-button">Forgot password?</button></div>
            <div className="input-wrap"><LockKeyhole size={18} /><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <label className="remember"><input type="checkbox" /><span>Keep me signed in</span></label>
            <button className="primary-button" type="submit" disabled={submitting}><span>{submitting ? "Signing in…" : "Sign in"}</span>{!submitting && <ArrowRight size={19} />}</button>
          </form>
          <div className="secure-note"><ShieldCheck size={17} /><span>Your session is encrypted and secured.</span></div>
        </div>
      </section>
    </main>
  );
}
