import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LockKeyhole, Mail, ShieldCheck, X, RotateCw } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ErrorAlert } from "../../components/common/ErrorAlert";
import { parseApiError } from "../../utils/errorHandler";
import { authenticateWithMe, getCurrentUser, verifyLoginOtp, resendLoginOtp } from "../../api/auth.api";
import { useAuth } from "../../context/AuthContext";
import { isAdminRole, isNormalUserRole } from "../../constants/roles";
import { AuthShell, AuthHeading, AuthField, AuthButton, AuthSuccess } from "./AuthShell";

const schema = z.object({
  email: z.string().trim().min(1, "Please enter your email"),
  password: z.string().min(1, "Please enter your password"),
});
const routeFor = (user) => isAdminRole(user) ? "/admin/dashboard" : "/user/dashboard";
const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function OtpDialog({ otp, setOtp, remaining, duration, resendWait, busy, error, dismissError, onVerify, onResend, onBack, success }) {
  const dialog = useRef(null);
  const input = useRef(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef(null);
  const requestClose = () => {
    if (busy || success || closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onBack(); return; }
    setClosing(true);
    exitTimer.current = setTimeout(onBack, 250);
  };
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  useEffect(() => {
    if (!success || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setClosing(true), 550);
    return () => clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    input.current?.focus();
    return () => { if (element.open) element.close(); };
  }, []);
  return (
    <dialog ref={dialog} className={`pt-otp-dialog ${closing ? "pt-closing" : ""}`} aria-labelledby="pt-otp-title" onCancel={(event) => { event.preventDefault(); requestClose(); }}>
      {success ? <AuthSuccess id="pt-otp-title" title="You're signed in" description="Opening your PayTeam account…" /> : <>
        <button type="button" className="pt-dialog-close" aria-label="Close verification" disabled={busy || closing} onClick={requestClose}><X size={21}/></button>
        <div className="pt-otp-icon"><ShieldCheck size={36} strokeWidth={1.6} /></div>
        <div className="pt-heading"><h1 id="pt-otp-title">Verify sign-in</h1><p>Enter your six-digit code to finish signing in.</p></div>
        <form className="pt-form" onSubmit={onVerify}>
          <ErrorAlert error={error} onDismiss={dismissError} />
          <div className="pt-field"><label htmlFor="login-otp">Verification code</label><div className="pt-otp-code">
            <input ref={input} id="login-otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} onPaste={event => { event.preventDefault(); setOtp(event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)); }} disabled={busy || closing || remaining === 0} aria-describedby="pt-otp-expiry" />
            {Array.from({length:6}, (_, i) => <span aria-hidden="true" key={i} className={`pt-otp-cell ${otp[i] ? "is-filled" : ""} ${i === Math.min(otp.length, 5) ? "is-current" : ""}`}>{otp[i] || "–"}</span>)}
          </div></div>
          <div className="pt-otp-meta" id="pt-otp-expiry"><span>{remaining ? "Code expires in" : "Code expired. Sign in again."}</span><strong>{formatTime(remaining)}</strong></div>
          <div className="pt-otp-progress" aria-hidden="true"><span style={{width:`${Math.min(100, Math.max(0, remaining / Math.max(duration, 1) * 100))}%`}} /></div>
          <AuthButton busy={busy} disabled={closing || remaining === 0 || otp.length !== 6}>{busy ? "Verifying…" : "Verify and sign in"}</AuthButton>
          <div className="pt-otp-actions"><button type="button" disabled={busy || closing} onClick={requestClose}>← Back to login</button><button type="button" disabled={busy || closing || resendWait > 0 || remaining === 0} onClick={onResend}><RotateCw size={14}/> {resendWait ? `Resend in ${resendWait}s` : "Resend code"}</button></div>
          {import.meta.env.DEV && <p className="pt-note">Development only: use the OTP generated in your backend terminal.</p>}
        </form>
      </>}
    </dialog>
  );
}

export const LoginPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [resendWait, setResendWait] = useState(0);
  const [successRoute, setSuccessRoute] = useState(null);
  const busyRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { verifySession, clearSession } = useAuth();
  const { register, handleSubmit, resetField, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: typeof location.state?.email === "string" ? location.state.email : "", password: "" } });

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) return;
    let cancelled = false;
    getCurrentUser().then(response => {
      const user = response?.data || response;
      if (!cancelled && (isAdminRole(user) || isNormalUserRole(user))) navigate(routeFor(user), { replace: true });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!challenge) return;
    const update = () => {
      setRemaining(Math.max(0, Math.ceil((challenge.deadline - Date.now()) / 1000)));
      setResendWait(Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000)));
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (!successRoute) return;
    const timer = setTimeout(() => navigate(successRoute, { replace: true }), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 850);
    return () => clearTimeout(timer);
  }, [successRoute, navigate]);

  const startChallenge = data => {
    const duration = Number(data.expiresIn);
    if (!data.loginToken || !Number.isFinite(duration) || duration <= 0) throw new Error("Invalid login challenge");
    setChallenge({ loginToken: data.loginToken, deadline: Date.now() + duration * 1000, duration, resendAt: Date.now() + 30000 });
    setRemaining(duration); setResendWait(30); setOtp("");
  };
  const completeLogin = async ({ accessToken, user }) => {
    if (!accessToken || (!isAdminRole(user) && !isNormalUserRole(user))) throw new Error("Access denied: unrecognized account role");
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user));
    if (isAdminRole(user)) localStorage.setItem("adminUser", JSON.stringify(user));
    else localStorage.removeItem("adminUser");
    await verifySession();
    toast.success("Signed in successfully.");
    setOtp(""); setSuccessRoute(routeFor(user));
  };
  const reportError = err => {
    const parsed = parseApiError(err);
    if (err?.response?.data?.code === "INVALID_LOGIN_OTP") parsed.message = err.response.data.message;
    setApiError(parsed);
  };
  const execute = async action => {
    if (busyRef.current || successRoute) return;
    busyRef.current = true; setIsLoading(true); setApiError(null);
    try { await action(); } catch (err) { reportError(err); }
    finally { busyRef.current = false; setIsLoading(false); }
  };
  const onSubmit = data => execute(async () => {
    const result = await authenticateWithMe({ identifier: data.email.trim(), password: data.password });
    if (result.otpRequired) { clearSession(); resetField("password"); startChallenge(result); return; }
    resetField("password"); await completeLogin(result);
  });
  const onVerifyOtp = event => {
    event.preventDefault();
    if (!challenge || Date.now() >= challenge.deadline || !/^\d{6}$/.test(otp)) return;
    return execute(async () => { await completeLogin(await verifyLoginOtp({ loginToken: challenge.loginToken, otp })); });
  };
  const onResendOtp = () => {
    if (!challenge || Date.now() < challenge.resendAt || Date.now() >= challenge.deadline) return;
    return execute(async () => { startChallenge(await resendLoginOtp(challenge.loginToken)); toast.success("A new OTP has been generated."); });
  };
  const onBack = () => { if (!busyRef.current && !successRoute) { setChallenge(null); setOtp(""); setApiError(null); } };

  return <AuthShell mode="login">
    {successRoute && !challenge ? <AuthSuccess title="You're signed in" description="Opening your PayTeam account…" /> : <>
      <AuthHeading title="Welcome back" description="Sign in to your PayTeam account." />
      <form className="pt-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {!challenge && <ErrorAlert error={apiError} onDismiss={() => setApiError(null)} />}
        <AuthField id="login-email" label="Email or mobile number" icon={Mail} registration={register("email")} error={errors.email?.message} autoComplete="username" placeholder="Enter your email or mobile" disabled={isLoading || Boolean(challenge)} />
        <AuthField id="login-password" label="Password" icon={LockKeyhole} registration={register("password")} error={errors.password?.message} type="password" autoComplete="current-password" placeholder="Enter your password" disabled={isLoading || Boolean(challenge)} />
        <div className="pt-row"><span><ShieldCheck size={14} style={{display:"inline",marginRight:5}} /> Secure sign-in</span><Link className="pt-link" to="/forgot-password">Forgot password?</Link></div>
        <AuthButton id="login-submit-button" busy={isLoading} disabled={Boolean(challenge)}>{isLoading ? "Signing in…" : "Sign in"}</AuthButton>
      </form>
      <p className="pt-switch">New to PayTeam? <Link to="/register" className="pt-link">Create an account</Link></p>
    </>}
    {challenge && <OtpDialog otp={otp} setOtp={setOtp} remaining={remaining} duration={challenge.duration} resendWait={resendWait} busy={isLoading} error={apiError} dismissError={() => setApiError(null)} onVerify={onVerifyOtp} onResend={onResendOtp} onBack={onBack} success={Boolean(successRoute)} />}
  </AuthShell>;
};
export default LoginPage;
