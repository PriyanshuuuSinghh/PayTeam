import { KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import PasswordUpdateForm from "../../features/auth/components/PasswordUpdateForm";

export default function UserSettings() {
  return <div className="space-y-5 max-w-4xl mx-auto"><h1>Account settings</h1><PasswordUpdateForm/>
    <section className="gw-panel gw-settings"><h2>Password recovery</h2><p>Request a recovery code for your account.</p>
      <Link className="gw-chip" to="/forgot-password"><KeyRound size={15}/>Reset password</Link></section>
  </div>;
}
