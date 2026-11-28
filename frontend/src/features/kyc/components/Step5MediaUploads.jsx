import { Camera, ImagePlus, CheckCircle2 } from "lucide-react";
import { KycDisclosure, KycUnavailable } from "./KycDisclosure";
import LiveVideoKycRecorder from "./LiveVideoKycRecorder";
export function Step5MediaUploads({ enabled, disclosure, retention, videoConsentScript, formData, onChange, onFileUpload, onNext, onPrev, isSavingStep, uploadStates = {} }) {
  const allUploaded = ["selfie", "video", "shop"].every(key => uploadStates[key]?.status === "uploaded");
  const busy = isSavingStep || Object.values(uploadStates).some(v => v.status === "uploading");
  if (!enabled && !allUploaded) return <KycUnavailable title="Media collection"/>;
  return <section className="space-y-4"><header className="pk-section-head"><h3>Photos and live video</h3><p>Upload the two required photos and record your video using the camera.</p></header>
    {enabled && <KycDisclosure text={disclosure} retention={retention} checked={formData.mediaConsent} onChange={v => onChange("mediaConsent",v)} disabled={busy}/>}
    {enabled && formData.mediaConsent && <div className="pk-media-grid">{[{key:"selfie",type:"selfie",field:"selfieFile",title:"Selfie",Icon:Camera},{key:"shop",type:"shop_image",field:"shopPhotoFile",title:"Shop photo",Icon:ImagePlus}].map(({key,type,field,title,Icon}) => {const state=uploadStates[key];return <article className="pk-panel pk-upload" key={key}><Icon size={26}/><h4>{title}</h4><p>{state?.status === "uploaded" ? "Uploaded" : state?.status === "uploading" ? "Uploading…" : "JPEG, PNG or WebP · up to 5 MB"}</p><input type="file" aria-label={title} accept="image/jpeg,image/png,image/webp" disabled={busy || state?.status === "uploaded"} onChange={e=>{const file=e.target.files?.[0];if(file)onFileUpload(file,type,field);e.target.value="";}}/>{state?.error && <p role="alert" className="pk-error">{state.error}</p>}</article>;})}<div className="pk-media-video"><div className="pk-panel pk-agreement-text"><strong>Read this consent statement during recording</strong>{"\n\n"}{videoConsentScript}</div><LiveVideoKycRecorder uploadState={uploadStates.video} onUpload={onFileUpload}/></div></div>}
    {!formData.mediaConsent && allUploaded && <p><CheckCircle2 size={16} className="inline"/> All required media uploaded.</p>}
    <div className="pk-step-actions">{onPrev && <button type="button" className="pk-secondary" disabled={busy} onClick={onPrev}>Previous step</button>}<button type="button" className="pk-primary" onClick={onNext} disabled={!allUploaded || busy}>Continue to agreement</button></div>
  </section>;
}
export default Step5MediaUploads;
