import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserRound, Mail, Smartphone, LockKeyhole, ShieldCheck } from "lucide-react";
import { registerCustomer } from "../../api/auth.api";
import { ErrorAlert } from "../../components/common/ErrorAlert";
import { parseApiError } from "../../utils/errorHandler";
import { AuthShell, AuthHeading, AuthField, AuthButton } from "./AuthShell";

const passwordSchema = z.string().min(8, "Use at least 8 characters").refine(value => new TextEncoder().encode(value).length <= 72, "Password must not exceed 72 bytes");
const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100).regex(/^[a-zA-Z\s]+$/, "Use letters and spaces"),
  email: z.string().trim().max(254).email("Enter a valid email"),
  mobile: z.string().trim().regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
const fields = [
  { name: "name", label: "Full name", icon: UserRound, type: "text", autoComplete: "name", placeholder: "Your full name" },
  { name: "email", label: "Email address", icon: Mail, type: "email", autoComplete: "email", placeholder: "you@example.com" },
  { name: "mobile", label: "Mobile number", icon: Smartphone, type: "tel", autoComplete: "tel", placeholder: "10-digit Indian mobile number" },
  { name: "password", label: "Password", icon: LockKeyhole, type: "password", autoComplete: "new-password", placeholder: "At least 8 characters" },
  { name: "confirmPassword", label: "Confirm password", icon: ShieldCheck, type: "password", autoComplete: "new-password", placeholder: "Re-enter your password" },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState(null);
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", mobile: "", password: "", confirmPassword: "" } });
  const password = useWatch({ control, name: "password" }) || "";
  const checks = [password.length >= 8, password.length >= 12, /[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password) && /[^a-zA-Z0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  const onSubmit = async ({ name, email, mobile, password }) => {
    setApiError(null);
    try {
      const result = await registerCustomer({ name, email, mobile, password });
      if (!result?.success) throw new Error(result?.message || "Registration failed");
      toast.success("Account created. Sign in to continue.");
      navigate("/login", { replace: true, state: { email } });
    } catch (error) { setApiError(parseApiError(error)); }
  };
  return <AuthShell mode="register">
    <AuthHeading title="Create your account" description="Get started with PayTeam. Your everyday payments, all in one place." />
    <form className="pt-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <ErrorAlert error={apiError} onDismiss={() => setApiError(null)} />
      {fields.map(({ name, ...field }) => <React.Fragment key={name}>
        <AuthField {...field} id={`register-${name}`} registration={register(name)} error={errors[name]?.message} disabled={isSubmitting} />
        {name === "password" && password && <div className="pt-password-hint"><div className="pt-password-bars" aria-hidden="true">{checks.map((_, i) => <span key={i} className={i < score ? "is-active" : ""} />)}</div><span>{score < 2 ? "Try a longer password" : score < 4 ? "Add variety for a stronger password" : "Good password variety"}</span></div>}
      </React.Fragment>)}
      <AuthButton busy={isSubmitting}>{isSubmitting ? "Creating account…" : "Create account"}</AuthButton>
      <p className="pt-note">No payment services are activated until your KYC and service eligibility checks are complete.</p>
    </form>
    <p className="pt-switch">Already have an account? <Link to="/login" className="pt-link">Sign in</Link></p>
  </AuthShell>;
}
