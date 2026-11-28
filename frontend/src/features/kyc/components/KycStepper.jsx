import { Check, Lock } from "lucide-react";

export function KycStepper({ steps, currentStep, completedSteps = [], onSelectStep, lockedBeforeStep = 1, isSubmitted }) {
  const doneCount = steps.filter(step => completedSteps.includes(step.id)).length;
  const percent = Math.round(doneCount / steps.length * 100);
  return <section className="pk-panel pk-stepper" aria-label="KYC verification progress">
    <div className="pk-progress-head"><div><h2>Your verification journey</h2><p>{doneCount} of {steps.length} steps completed</p></div><strong>{percent}%</strong></div>
    <div className="pk-progress" role="progressbar" aria-label="KYC step completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div>
    <ol className="pk-step-grid">{steps.map(step => {
      const done = completedSteps.includes(step.id);
      const current = !isSubmitted && step.id === currentStep;
      const allowed = !isSubmitted && step.id >= lockedBeforeStep && steps.filter(s => s.id < step.id).every(s => completedSteps.includes(s.id));
      const Icon = done ? Check : allowed ? step.icon : Lock;
      return <li key={step.id}><button type="button" className={`pk-step${current ? " pk-current" : ""}${done ? " pk-done" : ""}`} disabled={!allowed} aria-current={current ? "step" : undefined} aria-label={`${step.name}, ${done ? "completed" : current ? "current step" : allowed ? "available" : "locked"}`} onClick={() => onSelectStep(step.id)}><span className="pk-step-icon"><Icon size={20}/></span><span className="pk-step-number">STEP {String(step.id).padStart(2, "0")}</span><strong>{step.name}</strong><small>{done ? "Completed" : current ? "In progress" : allowed ? "Ready" : "Locked"}</small></button></li>;
    })}</ol>
  </section>;
}
export default KycStepper;
