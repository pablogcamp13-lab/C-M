import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, BookOpen, CheckCircle2, Clock3, Copy, Eye, Filter, Maximize2, Minimize2, Play, Plus, Send, Target, TrendingUp, Trash2, Users, X } from "lucide-react";
import {
  developmentApi,
  sharedRepositoryApi,
} from "../../api/sharedRepository";
import { useApp } from "../../context/AppContext";
import { useToast } from "../ui";

type CapsuleStatus = "BORRADOR" | "PUBLICADA" | "ARCHIVADA";
type Capsule = {
  id: string;
  title: string;
  description: string;
  campaignId?: string;
  gap: string;
  category?: string;
  difficulty?: string;
  version?: string;
  expiresAt?: string;
  duration: number;
  status: CapsuleStatus;
  content: { type: "URL" | "EMBED" | "HTML" | "VIDEO"; value: string };
  evaluation: {
    type: "FORMULARIO" | "FORO";
    questionType?: string;
    prompt: string;
    options?: string[];
    correctAnswer?: string;
    score: number;
    minimumScore: number;
    attempts: number;
    feedback: string;
    minChars?: number;
    requiredResponse?: boolean;
    allowPeers?: boolean;
    allowComments?: boolean;
    moderation?: boolean;
    dueAt?: string;
  };
  required: boolean;
  availableAt?: string;
  dueAt?: string;
  completionCriterion: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt?: string;
};
type AssignmentStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "VENCIDA";
type Assignment = {
  id: string;
  capsuleId: string;
  advisorId: string;
  campaignId?: string;
  origin: string;
  originId?: string;
  gap: string;
  assignedAt: string;
  dueAt?: string;
  status: AssignmentStatus;
  progress: number;
  result?: number;
  attempts: number;
  duration: number;
  forumPost?: string;
  evidence?: string;
  contentViewed?: boolean;
  baselineScore?: number | null;
  latestScore?: number | null;
  scoreDelta?: number | null;
  advisorActive?: boolean;
};
type ForumPost = {
  id: string;
  advisorId: string;
  advisorName: string;
  text: string;
  createdAt: string;
};
const emptyCapsule = (): Omit<Capsule, "id" | "status"> => ({
  title: "",
  description: "",
  campaignId: "",
  gap: "",
  category: "CALIDAD",
  difficulty: "BASICA",
  version: "1.0",
  expiresAt: "",
  duration: 10,
  content: { type: "URL", value: "" },
  evaluation: {
    type: "FORMULARIO",
    questionType: "UNICA",
    prompt: "",
    options: [],
    correctAnswer: "",
    score: 100,
    minimumScore: 80,
    attempts: 1,
    feedback: "",
    requiredResponse: true,
  },
  required: true,
  availableAt: "",
  dueAt: "",
  completionCriterion: "CONTENIDO_Y_EVALUACION",
});
const statusLabel: Record<string, string> = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  ARCHIVADA: "Archivada",
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADA: "Completada",
  VENCIDA: "Vencida",
};
const sanitize = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,object,embed,link,meta,base")
    .forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) =>
    [...node.attributes].forEach((attr) => {
      if (
        attr.name.startsWith("on") ||
        ["srcdoc", "formaction"].includes(attr.name)
      )
        node.removeAttribute(attr.name);
      if (
        ["href", "src"].includes(attr.name) &&
        !/^https?:|^data:image\//i.test(attr.value)
      )
        node.removeAttribute(attr.name);
    }),
  );
  return `<!doctype html><html><body style="margin:0;background:#071426;color:#eef6ff;font-family:Arial">${doc.body.innerHTML}</body></html>`;
};
const embedUrl = (value: string) => {
  const match = value.match(
    /<(?:iframe|embed)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i,
  );
  const raw = (match?.[1] || value).trim();
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};
const containsEmbed = (value: string) =>
  /<(?:iframe|embed)\b[^>]*\bsrc\s*=/i.test(value);
const trustedInteractiveHost = (url: string) => {
  try {
    return ["view.genially.com", "www.canva.com"].includes(
      new URL(url).hostname,
    );
  } catch {
    return false;
  }
};

const ContentFrame: React.FC<{
  capsule: Capsule;
  onEvent?: (data: any) => void;
  fullscreen?: boolean;
}> = ({ capsule, onEvent, fullscreen = false }) => {
  const embedded = containsEmbed(capsule.content.value);
  const url = embedUrl(capsule.content.value);
  const trusted = trustedInteractiveHost(url);
  useEffect(() => {
    if (!url || !onEvent) return;
    const origin = new URL(url).origin;
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        !["CONTENT_COMPLETED", "SCORE", "ATTEMPTS", "DURATION"].includes(
          event.data?.type,
        )
      )
        return;
      onEvent(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [url, onEvent]);
  if (capsule.content.type === "HTML" && !embedded)
    return (
      <iframe
        title={capsule.title}
        srcDoc={sanitize(capsule.content.value)}
        sandbox="allow-forms allow-popups"
        className="h-full min-h-[420px] w-full rounded-xl border border-[var(--cm-border)]"
      />
    );
  if (!url)
    return (
      <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[var(--cm-border)] text-sm text-[var(--cm-text-secondary)]">
        Ingresa una URL HTTPS o código embed válido.
      </div>
    );
  return (
    <iframe
      title={capsule.title}
      src={url}
      sandbox={
        trusted
          ? undefined
          : "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
      }
      allow="fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className={`${fullscreen ? "h-full min-h-0" : "aspect-video min-h-[420px]"} w-full rounded-xl border border-[var(--cm-border)] bg-black`}
    />
  );
};

export const DevelopmentView: React.FC = () => {
  const { currentUser } = useApp();
  const {toast}=useToast();
  const admin = currentUser.role === "ADMINISTRADOR";
  const monitor = currentUser.role === "MONITOR";
  const manager = admin || monitor;
  const [tabs, setTab] = useState(manager ? "PANEL" : "PENDIENTE");
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [editing, setEditing] = useState<Capsule | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Capsule | null>(null);
  const [active, setActive] = useState<Assignment | null>(null);
  const [capsuleSearch, setCapsuleSearch] = useState("");
  const [capsuleStatus, setCapsuleStatus] = useState("");
  const [capsuleCampaign, setCapsuleCampaign] = useState("");
  const [capsuleCategory,setCapsuleCategory]=useState("");
  const [showCapsuleFilters, setShowCapsuleFilters] = useState(false);
  const load = async () => {
    const [c, a, directory] = await Promise.all([
      developmentApi.capsules(),
      developmentApi.assignments(),
      sharedRepositoryApi.load(),
    ]);
    setCapsules(c.capsules);
    setAssignments(a.assignments);
    setAdvisors(directory.advisors);
    setCampaigns(directory.campaigns);
  };
  useEffect(() => {
    void load();
  }, []);
  const myAssignments = assignments.filter(
    (a) => Boolean(currentUser.advisorId) && a.advisorId === currentUser.advisorId,
  );
  const counts = (s: string) =>
    myAssignments.filter((a) => a.status === s).length;
  const cardCapsule = (a: Assignment) =>
    capsules.find((c) => c.id === a.capsuleId);
  const patchCapsule = async (c: Capsule, data: any) => {
    await developmentApi.updateCapsule(c.id, data);
    await load();
  };
  const removeCapsule=async(c:Capsule)=>{try{await developmentApi.removeCapsule(c.id);await load();toast({tone:'success',title:'Cápsula eliminada',description:`${c.title} fue eliminada correctamente.`})}catch(error){toast({tone:'error',title:'No se pudo eliminar la cápsula',description:error instanceof Error?error.message:undefined})}};
  const capsuleStats = useMemo(() => new Map(capsules.map(c => {
    const rows=assignments.filter(a=>a.capsuleId===c.id),completed=rows.filter(a=>a.status==="COMPLETADA"),scored=completed.filter(a=>a.result!==null&&a.result!==undefined&&Number.isFinite(Number(a.result))),deltas=rows.map(a=>a.scoreDelta).filter((value):value is number=>value!==null&&value!==undefined&&Number.isFinite(Number(value))).map(Number);
    return [c.id,{assigned:rows.length,completed:completed.length,completion:rows.length?Math.round(completed.length/rows.length*100):0,average:scored.length?Math.round(scored.reduce((sum,a)=>sum+Number(a.result),0)/scored.length):null,impact:deltas.length?Math.round(deltas.reduce((sum,value)=>sum+value,0)/deltas.length):null}];
  })),[capsules,assignments]);
  const filteredCapsules=useMemo(()=>capsules.filter(c=>(!capsuleSearch||`${c.title} ${c.description} ${c.gap}`.toLowerCase().includes(capsuleSearch.toLowerCase()))&&(!capsuleStatus||c.status===capsuleStatus)&&(!capsuleCampaign||c.campaignId===capsuleCampaign)&&(!capsuleCategory||c.category===capsuleCategory)),[capsules,capsuleSearch,capsuleStatus,capsuleCampaign,capsuleCategory]);
  const advisorTabs: AssignmentStatus[] = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "VENCIDA"];
  return (
    <main className="cm-workspace min-h-full p-5 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="cm-page-heading flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--cm-primary)]">
              {admin ? "Gestión de Desarrollo" : monitor ? "Mis cápsulas" : "Mi Desarrollo"}
            </p>
            <h1 className="mt-1 text-2xl font-bold">Cápsulas de desarrollo</h1>
          </div>
          {manager && (
            <button
              onClick={() => setCreating(true)}
              className="cm-button-primary px-4 py-2"
            >
              <Plus className="h-4 w-4" />
              Crear cápsula
            </button>
          )}
        </header>
        <nav className="cm-tabs mt-5 flex gap-2">
          {(manager
            ? (admin ? ["PANEL", "CÁPSULAS", "ASIGNACIONES", "SEGUIMIENTO"] : ["PANEL", "CÁPSULAS"])
            : advisorTabs
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tabs === t ? "active" : ""}
            >
              {manager
                ? t[0] + t.slice(1).toLowerCase()
                : `${statusLabel[t]} (${counts(t)})`}
            </button>
          ))}
        </nav>
        {manager && tabs === "PANEL" && (
          <DevelopmentPanel capsules={capsules} assignments={assignments} advisors={advisors} capsuleStats={capsuleStats}/>
        )}
        {manager && tabs === "CÁPSULAS" && (
          <section className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-bold">Biblioteca de desarrollo</h2><p className="text-xs text-[var(--cm-text-secondary)]">Relaciona contenidos con brechas y mide su efectividad.</p></div>
              <button onClick={()=>setShowCapsuleFilters(value=>!value)} className="cm-button-secondary px-3 py-2 text-xs"><Filter className="h-4 w-4"/> Filtros {showCapsuleFilters?'−':'+'}</button>
            </div>
            {showCapsuleFilters&&<div className="cm-card mb-4 grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
              <input className="cm-input p-2" placeholder="Buscar título, brecha o descripción" value={capsuleSearch} onChange={e=>setCapsuleSearch(e.target.value)}/>
              <select className="cm-select p-2" value={capsuleStatus} onChange={e=>setCapsuleStatus(e.target.value)}><option value="">Todos los estados</option>{["BORRADOR","PUBLICADA","ARCHIVADA"].map(value=><option key={value} value={value}>{statusLabel[value]}</option>)}</select>
              <select className="cm-select p-2" value={capsuleCampaign} onChange={e=>setCapsuleCampaign(e.target.value)}><option value="">Todas las campañas</option>{campaigns.map((campaign:any)=><option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
              <select className="cm-select p-2" value={capsuleCategory} onChange={e=>setCapsuleCategory(e.target.value)}><option value="">Todas las categorías</option><option value="CALIDAD">Calidad</option><option value="VENTAS">Ventas</option><option value="COMPLIANCE">Compliance</option><option value="HABILIDADES">Habilidades blandas</option></select>
            </div>}
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filteredCapsules.map((c) => {
              const stats=capsuleStats.get(c.id)!;
              const expired=Boolean(c.expiresAt&&c.expiresAt<new Date().toISOString().slice(0,10));
              return (
              <article key={c.id} className="cm-card p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2"><span className="cm-badge">{expired?'Vencida':statusLabel[c.status]}</span><span className="cm-badge">{c.category||'CALIDAD'}</span><span className="cm-badge">{c.difficulty||'BÁSICA'}</span></div>
                    <h3 className="mt-2 font-bold">{c.title}</h3>
                    <p className="mt-1 text-xs text-[var(--cm-text-secondary)]">
                      {c.description || "Sin descripción"} · {c.duration} min
                    </p>
                    <p className="mt-2 text-xs text-[var(--cm-primary)]">{c.gap||'Sin brecha asociada'} · v{c.version||'1.0'}{c.expiresAt?` · Vigente hasta ${c.expiresAt}`:''}</p>
                  </div>
                  <button
                    onClick={() => setEditing(c)}
                    className="cm-button-secondary h-9 p-2"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[var(--cm-border)] py-3 text-center text-xs"><div><strong className="block text-base">{stats.assigned}</strong><span className="text-[var(--cm-text-secondary)]">Asignados</span></div><div><strong className="block text-base">{stats.completion}%</strong><span className="text-[var(--cm-text-secondary)]">Finalización</span></div><div><strong className="block text-base">{stats.impact===null?'—':`${stats.impact>0?'+':''}${stats.impact}`}</strong><span className="text-[var(--cm-text-secondary)]">Impacto</span></div></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditing(c)}
                    className="cm-button-secondary px-2 py-1 text-xs"
                  >
                    Editar / previsualizar
                  </button>
                  <button
                    onClick={() =>
                      void developmentApi.duplicateCapsule(c.id).then(load)
                    }
                    className="cm-button-secondary p-1.5"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {c.status === "BORRADOR" && (
                    <button
                      onClick={() =>
                        void patchCapsule(c, { status: "PUBLICADA" })
                      }
                      className="cm-button-primary px-2 py-1 text-xs"
                    >
                      Publicar
                    </button>
                  )}
                  {c.status === "PUBLICADA" && (
                    <>
                      {admin && !expired && <button
                        onClick={() => setAssigning(c)}
                        className="cm-button-primary px-2 py-1 text-xs"
                      >
                        <Send className="h-3 w-3" />
                        Asignar
                      </button>}
                      <button
                        onClick={() =>
                          void patchCapsule(c, { status: "ARCHIVADA" })
                        }
                        className="cm-button-secondary p-1.5"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`¿Eliminar ${c.title}?`))
                        void removeCapsule(c);
                    }}
                    className="cm-button-secondary p-1.5 text-[var(--cm-danger)]"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            )})}
            {!filteredCapsules.length && <Empty text={capsules.length?"No hay cápsulas que coincidan con los filtros.":"Aún no hay cápsulas creadas."} />}
            </div>
          </section>
        )}
        {admin && ["ASIGNACIONES", "SEGUIMIENTO"].includes(tabs) && (
          <Tracking
            assignments={assignments}
            capsules={capsules}
            advisors={advisors}
            campaigns={campaigns}
            mode={tabs}
          />
        )}{" "}
        {!manager && (
          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {myAssignments
              .filter((a) => a.status === tabs)
              .map((a) => {
                const c = cardCapsule(a);
                return (
                  c && (
                    <article key={a.id} className="cm-card p-4">
                      <span className="cm-badge">{statusLabel[a.status]}</span>
                      <h3 className="mt-3 font-bold">{c.title}</h3>
                      <p className="mt-1 text-xs text-[var(--cm-text-secondary)]">
                        {c.evaluation.type === "FORMULARIO"
                          ? "Formulario"
                          : "Foro"}{" "}
                        · {a.origin} · {c.duration} min
                      </p>
                      <p className="mt-2 text-xs">
                        Vence: {a.dueAt || "Sin vencimiento"}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--cm-surface-elevated)]">
                        <span
                          className="block h-full bg-[var(--cm-primary)]"
                          style={{ width: `${a.progress || 0}%` }}
                        />
                      </div>
                      <button
                        onClick={() => setActive(a)}
                        className="cm-button-primary mt-4 w-full px-3 py-2"
                      >
                        <Play className="h-4 w-4" />
                        {a.status === "PENDIENTE"
                          ? "Comenzar"
                          : a.status === "EN_CURSO"
                            ? "Continuar"
                            : "Ver resultado"}
                      </button>
                    </article>
                  )
                );
              })}
            {!myAssignments.some((a) => a.status === tabs) && (
              <Empty text="No tienes cápsulas en este estado." />
            )}
          </section>
        )}
      </div>
      {(creating || editing) && (
        <CapsuleModal
          initial={editing}
          campaigns={campaigns}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (data) => {
            try{const wasEditing=Boolean(editing);editing?await developmentApi.updateCapsule(editing.id,data):await developmentApi.createCapsule(data);setCreating(false);setEditing(null);await load();toast({tone:'success',title:wasEditing?'Cápsula actualizada':'Cápsula creada',description:wasEditing?'Los cambios fueron guardados correctamente.':'La cápsula fue guardada como borrador.'})}catch(error){toast({tone:'error',title:'No se pudo guardar la cápsula',description:error instanceof Error?error.message:undefined})}
          }}
        />
      )}
      {assigning && (
        <AssignModal
          capsule={assigning}
          advisors={advisors}
          campaigns={campaigns}
          onClose={() => setAssigning(null)}
          onSave={async (data) => {
            await developmentApi.assign({ capsuleId: assigning.id, ...data });
            setAssigning(null);
            await load();
          }}
        />
      )}
      {active && (
        <Player
          assignment={active}
          capsule={cardCapsule(active)!}
          onClose={() => setActive(null)}
          onSave={async (data) => {
            const result = await developmentApi.updateAssignment(
              active.id,
              data,
            );
            setActive(result.assignment);
            await load();
            return result.assignment;
          }}
        />
      )}
    </main>
  );
};

const DevelopmentPanel=({capsules,assignments,advisors,capsuleStats}:any)=>{
  const completed=assignments.filter((a:any)=>a.status==='COMPLETADA'),active=assignments.filter((a:any)=>['PENDIENTE','EN_CURSO'].includes(a.status)),overdue=assignments.filter((a:any)=>a.status==='VENCIDA'),results=completed.filter((a:any)=>a.result!==null&&a.result!==undefined).map((a:any)=>Number(a.result)).filter(Number.isFinite),deltas=assignments.filter((a:any)=>a.scoreDelta!==null&&a.scoreDelta!==undefined).map((a:any)=>Number(a.scoreDelta)).filter(Number.isFinite);
  const completion=assignments.length?Math.round(completed.length/assignments.length*100):0,average=results.length?Math.round(results.reduce((a:number,b:number)=>a+b,0)/results.length):0,impact=deltas.length?Math.round(deltas.reduce((a:number,b:number)=>a+b,0)/deltas.length):null;
  const gaps=Object.entries(assignments.reduce((out:any,item:any)=>{const gap=item.gap||capsules.find((c:any)=>c.id===item.capsuleId)?.gap||'Sin brecha';out[gap]=(out[gap]||0)+1;return out},{})).sort((a:any,b:any)=>b[1]-a[1]).slice(0,5);
  const ranked=capsules.map((c:any)=>({capsule:c,stats:capsuleStats.get(c.id)})).filter((item:any)=>item.stats.assigned).sort((a:any,b:any)=>b.stats.completion-a.stats.completion).slice(0,5);
  return <section className="mt-5 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Publicadas" value={capsules.filter((c:any)=>c.status==='PUBLICADA').length} icon={<BookOpen/>}/><Metric label="Asignaciones activas" value={active.length} icon={<Users/>}/><Metric label="Finalización" value={`${completion}%`} icon={<CheckCircle2/>}/><Metric label="Vencidas" value={overdue.length} icon={<AlertTriangle/>} danger={Boolean(overdue.length)}/><Metric label="Nota promedio" value={average||'—'} icon={<Target/>}/><Metric label="Impacto posterior" value={impact===null?'—':`${impact>0?'+':''}${impact} pts`} icon={<TrendingUp/>}/></div>
    <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
      <article className="cm-card p-5"><h2 className="font-bold">Brechas con mayor demanda</h2><p className="text-xs text-[var(--cm-text-secondary)]">Asignaciones generadas para cerrar cada brecha.</p><div className="mt-5 space-y-4">{gaps.map(([gap,count]:any)=>{const width=assignments.length?Math.max(8,Math.round(count/assignments.length*100)):0;return <div key={gap}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{gap}</span><b>{count}</b></div><div className="h-2 rounded bg-[var(--cm-surface-elevated)]"><span className="block h-full rounded bg-[var(--cm-primary)]" style={{width:`${width}%`}}/></div></div>})}{!gaps.length&&<p className="py-8 text-center text-sm text-[var(--cm-text-secondary)]">Aún no hay asignaciones.</p>}</div></article>
      <article className="cm-card overflow-hidden"><div className="p-5"><h2 className="font-bold">Efectividad por cápsula</h2><p className="text-xs text-[var(--cm-text-secondary)]">Finalización, aprendizaje e impacto en evaluaciones posteriores.</p></div><div className="overflow-x-auto"><table className="cm-table min-w-[620px]"><thead><tr><th>Cápsula</th><th>Asignados</th><th>Finalización</th><th>Nota</th><th>Impacto</th></tr></thead><tbody>{ranked.map(({capsule,stats}:any)=><tr key={capsule.id}><td><b>{capsule.title}</b><span className="block text-xs text-[var(--cm-text-secondary)]">{capsule.gap||'Sin brecha'}</span></td><td>{stats.assigned}</td><td>{stats.completion}%</td><td>{stats.average??'—'}</td><td className={stats.impact>0?'text-emerald-400':''}>{stats.impact===null?'Pendiente':`${stats.impact>0?'+':''}${stats.impact} pts`}</td></tr>)}</tbody></table>{!ranked.length&&<p className="p-8 text-center text-sm text-[var(--cm-text-secondary)]">Publica y asigna una cápsula para medir resultados.</p>}</div></article>
    </div>
    <p className="text-xs text-[var(--cm-text-secondary)]"><Clock3 className="mr-1 inline h-3.5 w-3.5"/>Impacto: diferencia entre la última evaluación previa y la evaluación posterior a la asignación. {advisors.filter((a:any)=>a.active!==false&&a.status!=='INACTIVO').length} asesores activos disponibles.</p>
  </section>
};
const Metric = ({ label, value, icon, danger=false }: { label: string; value: number|string; icon?:React.ReactNode; danger?:boolean }) => (
  <article className="cm-card p-4"><div className="flex items-center justify-between"><p className="text-xs text-[var(--cm-text-secondary)]">{label}</p><span className={danger?'text-[var(--cm-danger)]':'text-[var(--cm-primary)]'}>{icon&&React.cloneElement(icon as React.ReactElement<any>,{className:'h-4 w-4'})}</span></div><strong className="mt-2 block text-2xl">{value}</strong></article>
);
const Empty = ({ text }: { text: string }) => (
  <div className="cm-card col-span-full p-10 text-center text-sm text-[var(--cm-text-secondary)]">
    {text}
  </div>
);
const Overlay = ({ children }: { children: React.ReactNode }) =>
  createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
      {children}
    </div>,
    document.body,
  );
const CapsuleModal = ({ initial, campaigns, onClose, onSave }: any) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<any>(initial || emptyCapsule());
  const set = (key: string, value: any) =>
    setForm((f: any) => ({ ...f, [key]: value }));
  return (
    <Overlay>
      <div className="cm-modal my-auto w-full max-w-5xl">
        <header className="flex justify-between border-b border-[var(--cm-border)] p-5">
          <div>
            <h2 className="font-bold">
              {initial ? "Editar" : "Crear"} cápsula
            </h2>
            <p className="text-xs text-[var(--cm-text-secondary)]">
              Paso {step} de 3 · Contenido, evaluación y reglas
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto p-5">
          {step === 1 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Título">
                <input
                  className="cm-input p-2"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </Field>
              <Field label="Campaña">
                <select
                  className="cm-select p-2"
                  value={form.campaignId}
                  onChange={(e) => set("campaignId", e.target.value)}
                >
                  <option value="">Todas</option>
                  {campaigns.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descripción">
                <input
                  className="cm-input p-2"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <Field label="Competencia / brecha">
                <input
                  className="cm-input p-2"
                  value={form.gap}
                  onChange={(e) => set("gap", e.target.value)}
                />
              </Field>
              <Field label="Categoría">
                <select className="cm-select p-2" value={form.category||"CALIDAD"} onChange={(e)=>set("category",e.target.value)}><option value="CALIDAD">Calidad</option><option value="VENTAS">Ventas</option><option value="COMPLIANCE">Compliance</option><option value="HABILIDADES">Habilidades blandas</option></select>
              </Field>
              <Field label="Dificultad">
                <select className="cm-select p-2" value={form.difficulty||"BASICA"} onChange={(e)=>set("difficulty",e.target.value)}><option value="BASICA">Básica</option><option value="INTERMEDIA">Intermedia</option><option value="AVANZADA">Avanzada</option></select>
              </Field>
              <Field label="Versión">
                <input className="cm-input p-2" value={form.version||"1.0"} onChange={(e)=>set("version",e.target.value)}/>
              </Field>
              <Field label="Duración estimada">
                <input
                  type="number"
                  className="cm-input p-2"
                  value={form.duration}
                  onChange={(e) => set("duration", Number(e.target.value))}
                />
              </Field>
              <Field label="Tipo de contenido">
                <select
                  className="cm-select p-2"
                  value={form.content.type}
                  onChange={(e) =>
                    set("content", { ...form.content, type: e.target.value })
                  }
                >
                  <option>URL</option>
                  <option>EMBED</option>
                  <option>HTML</option>
                  <option>VIDEO</option>
                </select>
              </Field>
              <label className="md:col-span-2 text-sm font-semibold">
                URL / embed / HTML
                <textarea
                  className="cm-input mt-1 min-h-28 p-2"
                  value={form.content.value}
                  onChange={(e) =>
                    set("content", { ...form.content, value: e.target.value })
                  }
                />
              </label>
              <div className="md:col-span-2 min-h-[430px]">
                <ContentFrame
                  capsule={{ ...form, id: "preview", status: "BORRADOR" }}
                />
              </div>
            </div>
          )}
          {step === 2 && <EvaluationEditor form={form} set={set} />}{" "}
          {step === 3 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Obligatoriedad">
                <select
                  className="cm-select p-2"
                  value={String(form.required)}
                  onChange={(e) => set("required", e.target.value === "true")}
                >
                  <option value="true">Obligatoria</option>
                  <option value="false">Opcional</option>
                </select>
              </Field>
              <Field label="Disponibilidad">
                <input
                  type="datetime-local"
                  className="cm-input p-2"
                  value={form.availableAt}
                  onChange={(e) => set("availableAt", e.target.value)}
                />
              </Field>
              <Field label="Vencimiento">
                <input
                  type="datetime-local"
                  className="cm-input p-2"
                  value={form.dueAt}
                  onChange={(e) => set("dueAt", e.target.value)}
                />
              </Field>
              <Field label="Vigencia de la cápsula">
                <input type="date" className="cm-input p-2" value={form.expiresAt||""} onChange={(e)=>set("expiresAt",e.target.value)}/>
              </Field>
              <Field label="Criterio de finalización">
                <select
                  className="cm-select p-2"
                  value={form.completionCriterion}
                  onChange={(e) => set("completionCriterion", e.target.value)}
                >
                  <option value="CONTENIDO_Y_EVALUACION">
                    Contenido visto + evaluación aprobada
                  </option>
                  <option value="CONTENIDO_Y_PARTICIPACION">
                    Contenido visto + participación publicada
                  </option>
                </select>
              </Field>
            </div>
          )}
        </div>
        <footer className="flex justify-between border-t border-[var(--cm-border)] p-4">
          <button
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            className="cm-button-secondary px-3 py-2"
          >
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="cm-button-primary px-4 py-2"
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={() => void onSave(form)}
              disabled={
                !form.title || !form.content.value || !form.evaluation.prompt
              }
              className="cm-button-primary px-4 py-2"
            >
              Guardar cápsula
            </button>
          )}
        </footer>
      </div>
    </Overlay>
  );
};
const EvaluationEditor = ({ form, set }: any) => {
  const ev = form.evaluation;
  const update = (x: any) => set("evaluation", { ...ev, ...x });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Tipo">
        <select
          className="cm-select p-2"
          value={ev.type}
          onChange={(e) => update({ type: e.target.value })}
        >
          <option value="FORMULARIO">Formulario</option>
          <option value="FORO">Foro</option>
        </select>
      </Field>
      {ev.type === "FORMULARIO" ? (
        <>
          <Field label="Tipo de pregunta">
            <select
              className="cm-select p-2"
              value={ev.questionType}
              onChange={(e) => update({ questionType: e.target.value })}
            >
              <option value="UNICA">Selección única</option>
              <option value="MULTIPLE">Selección múltiple</option>
              <option value="VF">Verdadero / falso</option>
              <option value="CORTA">Respuesta corta</option>
              <option value="ABIERTA">Respuesta abierta</option>
            </select>
          </Field>
          <Field label="Pregunta">
            <input
              className="cm-input p-2"
              value={ev.prompt}
              onChange={(e) => update({ prompt: e.target.value })}
            />
          </Field>
          <Field label="Opciones separadas por coma">
            <input
              className="cm-input p-2"
              value={(ev.options || []).join(",")}
              onChange={(e) =>
                update({
                  options: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Respuesta correcta">
            <input
              className="cm-input p-2"
              value={ev.correctAnswer}
              onChange={(e) => update({ correctAnswer: e.target.value })}
            />
          </Field>
          <Field label="Puntaje">
            <input
              type="number"
              className="cm-input p-2"
              value={ev.score}
              onChange={(e) => update({ score: Number(e.target.value) })}
            />
          </Field>
          <Field label="Nota mínima">
            <input
              type="number"
              className="cm-input p-2"
              value={ev.minimumScore}
              onChange={(e) => update({ minimumScore: Number(e.target.value) })}
            />
          </Field>
          <Field label="Intentos">
            <input
              type="number"
              className="cm-input p-2"
              value={ev.attempts}
              onChange={(e) => update({ attempts: Number(e.target.value) })}
            />
          </Field>
          <Field label="Feedback posterior">
            <input
              className="cm-input p-2"
              value={ev.feedback}
              onChange={(e) => update({ feedback: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Pregunta detonadora">
            <input
              className="cm-input p-2"
              value={ev.prompt}
              onChange={(e) => update({ prompt: e.target.value })}
            />
          </Field>
          <Field label="Mínimo de caracteres">
            <input
              type="number"
              className="cm-input p-2"
              value={ev.minChars || 20}
              onChange={(e) => update({ minChars: Number(e.target.value) })}
            />
          </Field>
          {[
            "requiredResponse",
            "allowPeers",
            "allowComments",
            "moderation",
          ].map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(ev[k])}
                onChange={(e) => update({ [k]: e.target.checked })}
              />
              {k === "requiredResponse"
                ? "Respuesta obligatoria"
                : k === "allowPeers"
                  ? "Permitir respuestas de compañeros"
                  : k === "allowComments"
                    ? "Permitir comentarios"
                    : "Moderación"}
            </label>
          ))}
          <Field label="Fecha límite">
            <input
              type="date"
              className="cm-input p-2"
              value={ev.dueAt || ""}
              onChange={(e) => update({ dueAt: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
};
const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1 text-sm font-semibold">
    {label}
    {children}
  </label>
);
const AssignModal = ({
  capsule,
  advisors,
  campaigns,
  onClose,
  onSave,
}: any) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignId, setCampaign] = useState("");
  const [groupId, setGroup] = useState("");
  const [scope,setScope]=useState("INDIVIDUAL");
  const [search,setSearch]=useState("");
  const [origin, setOrigin] = useState("Manual");
  const [originId, setOriginId] = useState("");
  const [dueAt, setDue] = useState("");
  const availableAdvisors = advisors
    .filter(
      (a: any) =>
        a.active !== false &&
        a.status !== "INACTIVO" &&
        (!campaignId || a.campaignId === campaignId) &&
        (!search||a.name.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
  const groups = [
    ...new Set(availableAdvisors.map((a: any) => a.teamId).filter(Boolean)),
  ];
  return (
    <Overlay>
      <div className="cm-modal w-full max-w-xl p-5">
        <div className="flex justify-between">
          <h2 className="font-bold">Asignar · {capsule.title}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Tipo de asignación">
            <select className="cm-select p-2" value={scope} onChange={e=>{setScope(e.target.value);setSelected([]);setGroup("")}}><option value="INDIVIDUAL">Asesores seleccionados</option><option value="CAMPAIGN">Toda la campaña</option><option value="GROUP">Equipo completo</option></select>
          </Field>
          <Field label="Campaña">
            <select
              className="cm-select p-2"
              value={campaignId}
              onChange={(e) => {
                setCampaign(e.target.value);
                setGroup("");
                setSelected([]);
              }}
            >
              <option value="">Todas las campañas</option>
              {campaigns
                .filter((c: any) => c.status === "ACTIVA")
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          {scope==="GROUP"&&<Field label="Grupo / equipo">
            <select
              className="cm-select p-2"
              value={groupId}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Sin grupo</option>
              {groups.map((id: any) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Field>}
          {scope==="INDIVIDUAL"&&<><Field label="Buscar asesor"><input className="cm-input p-2" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre del asesor"/></Field><div className="flex items-center justify-between text-xs"><span>{selected.length} seleccionados</span><button className="text-[var(--cm-primary)]" onClick={()=>setSelected(availableAdvisors.map((a:any)=>a.id))}>Seleccionar visibles</button></div><Field label={`Asesores de dotación (${availableAdvisors.length})`}>
            <select
              multiple
              className="cm-select min-h-32 p-2"
              value={selected}
              onChange={(e) =>
                setSelected([...e.target.selectedOptions].map((o) => o.value))
              }
            >
              {availableAdvisors.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field></>}
          <Field label="Origen">
            <select
              className="cm-select p-2"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              {[
                "Manual",
                "Evaluación de Calidad",
                "Mejora Continua",
                "Feedback",
                "Plan de Acción",
                "OJT",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          {origin !== "Manual" && (
            <Field label="ID del registro de origen">
              <input
                className="cm-input p-2"
                value={originId}
                onChange={(e) => setOriginId(e.target.value)}
              />
            </Field>
          )}
          <Field label="Vencimiento">
            <input
              type="date"
              className="cm-input p-2"
              value={dueAt}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="cm-button-secondary px-3 py-2">
            Cancelar
          </button>
          <button
            onClick={() =>
              void onSave({
                advisorIds: selected,
                campaignId:scope==="CAMPAIGN"?campaignId:"",
                groupId:scope==="GROUP"?groupId:"",
                origin,
                originId,
                dueAt,
                gap:capsule.gap,
              })
            }
            disabled={(scope==="INDIVIDUAL"&&!selected.length)||(scope==="CAMPAIGN"&&!campaignId)||(scope==="GROUP"&&!groupId)}
            className="cm-button-primary px-3 py-2"
          >
            Asignar
          </button>
        </div>
      </div>
    </Overlay>
  );
};
const Tracking = ({ assignments, capsules, advisors, campaigns, mode }: any) => {
  const [filters, setFilters] = useState({
    advisor: "",
    campaign: "",
    capsule: "",
    gap: "",
    state: "",
    from: "",
    to: "",
  });
  const [selected, setSelected] = useState<any>(null);
  const set = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const filtered = assignments.filter(
    (a: any) =>
      (!filters.advisor||(advisors.find((advisor:any)=>advisor.id===a.advisorId)?.name||'').toLowerCase().includes(filters.advisor.toLowerCase()))&&
      (!filters.state || a.status === filters.state) &&
      (!filters.campaign || a.campaignId === filters.campaign) &&
      (!filters.capsule || a.capsuleId === filters.capsule) &&
      (!filters.gap ||
        a.gap?.toLowerCase().includes(filters.gap.toLowerCase())) &&
      (!filters.from || a.assignedAt >= filters.from) &&
      (!filters.to || a.assignedAt.slice(0, 10) <= filters.to),
  );
  return (
    <section className="cm-card mt-5 overflow-hidden">
      <div className="border-b border-[var(--cm-border)] p-4"><h2 className="font-bold">{mode==='SEGUIMIENTO'?'Seguimiento e impacto':'Asignaciones de aprendizaje'}</h2><p className="text-xs text-[var(--cm-text-secondary)]">{mode==='SEGUIMIENTO'?'Compara el desempeño previo y posterior al desarrollo.':'Consulta el alcance, origen, avance y vencimiento de cada asignación.'}</p></div>
      <div className="grid gap-2 p-3 md:grid-cols-3 xl:grid-cols-7">
        <input className="cm-input p-2" placeholder="Buscar asesor" value={filters.advisor} onChange={e=>set("advisor",e.target.value)}/>
        <select
          className="cm-select p-2"
          value={filters.campaign}
          onChange={(e) => set("campaign", e.target.value)}
        >
          <option value="">Campaña</option>
          {campaigns.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="cm-select p-2"
          value={filters.capsule}
          onChange={(e) => set("capsule", e.target.value)}
        >
          <option value="">Cápsula</option>
          {capsules.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <input
          className="cm-input p-2"
          placeholder="Brecha"
          value={filters.gap}
          onChange={(e) => set("gap", e.target.value)}
        />
        <select
          className="cm-select p-2"
          value={filters.state}
          onChange={(e) => set("state", e.target.value)}
        >
          <option value="">Estado</option>
          {["PENDIENTE", "EN_CURSO", "COMPLETADA", "VENCIDA"].map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="cm-input p-2"
          value={filters.from}
          onChange={(e) => set("from", e.target.value)}
        />
        <input
          type="date"
          className="cm-input p-2"
          value={filters.to}
          onChange={(e) => set("to", e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="cm-table min-w-[900px]">
          <thead>
            <tr>
              <th>Asesor</th>
              <th>Cápsula</th>
              <th>Campaña</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Avance</th>
              <th>Resultado</th>
              {mode==='SEGUIMIENTO'&&<><th>Antes</th><th>Después</th><th>Impacto</th></>}
              <th>Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a: any) => (
              <tr
                key={a.id}
                onClick={() => setSelected(a)}
                className="cursor-pointer"
              >
                <td>
                  {advisors.find((x: any) => x.id === a.advisorId)?.name ||
                    a.advisorId}
                </td>
                <td>
                  {capsules.find((x: any) => x.id === a.capsuleId)?.title ||
                    a.capsuleId}
                </td>
                <td>
                  {campaigns.find((x: any) => x.id === a.campaignId)?.name ||
                    "—"}
                </td>
                <td>{a.origin}</td>
                <td>{statusLabel[a.status]}</td>
                <td>{a.progress}%</td>
                <td>{a.result ?? "—"}</td>
                {mode==='SEGUIMIENTO'&&<><td>{a.baselineScore??'—'}</td><td>{a.latestScore??'—'}</td><td className={Number(a.scoreDelta)>0?'text-emerald-400':Number(a.scoreDelta)<0?'text-[var(--cm-danger)]':''}>{a.scoreDelta==null?'Pendiente':`${a.scoreDelta>0?'+':''}${a.scoreDelta} pts`}</td></>}
                <td>{a.dueAt || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <Empty text="Sin asignaciones para mostrar." />}
      {selected && (
        <Overlay>
          <div className="cm-modal w-full max-w-lg p-5">
            <div className="flex justify-between">
              <h3 className="font-bold">Detalle de seguimiento</h3>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Info label="Progreso" value={`${selected.progress}%`} />
              <Info label="Tiempo" value={`${selected.duration || 0} min`} />
              <Info label="Intentos" value={selected.attempts || 0} />
              <Info label="Resultado" value={selected.result ?? "—"} />
              <Info label="Evaluación previa" value={selected.baselineScore ?? "—"} />
              <Info label="Evaluación posterior" value={selected.latestScore ?? "Pendiente"} />
              <Info label="Impacto" value={selected.scoreDelta == null ? "Pendiente" : `${selected.scoreDelta > 0 ? "+" : ""}${selected.scoreDelta} pts`} />
              <Info label="Dotación" value={selected.advisorActive===false?"Cesado":"Activo"}/>
              <Info label="Participación" value={selected.forumPost || "—"} />
              <Info label="Evidencia" value={selected.evidence || "—"} />
              <Info
                label="Origen"
                value={`${selected.origin}${selected.originId ? ` · ${selected.originId}` : ""}`}
              />
            </div>
          </div>
        </Overlay>
      )}
    </section>
  );
};
const Info = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-lg bg-[var(--cm-surface-elevated)] p-3">
    <span className="block text-xs text-[var(--cm-text-secondary)]">
      {label}
    </span>
    <strong>{value}</strong>
  </div>
);
const Player = ({ assignment, capsule, onClose, onSave }: any) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [phase, setPhase] = useState(
    assignment.contentViewed ? "EVALUACION" : "CONTENIDO",
  );
  const isForum = capsule.evaluation.type === "FORO";
  const [answer, setAnswer] = useState(isForum ? "" : assignment.forumPost || "");
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [forumError, setForumError] = useState("");
  const loadForum = async () => {
    if (!isForum) return;
    try {
      const result = await developmentApi.forum(capsule.id);
      setForumPosts(result.posts);
      setForumError("");
    } catch (error: any) {
      setForumError(error.message || "No se pudo cargar el foro.");
    }
  };
  useEffect(() => { void loadForum(); }, [capsule.id, isForum]);
  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await playerRef.current?.requestFullscreen();
  };
  const closePlayer = async () => {
    if (document.fullscreenElement === playerRef.current) await document.exitFullscreen().catch(() => undefined);
    onClose();
  };
  const multiple = capsule.evaluation.questionType === "MULTIPLE";
  const selected = answer
    .split(",")
    .map((x: string) => x.trim())
    .filter(Boolean);
  const choose = (option: string) =>
    setAnswer(
      multiple
        ? (selected.includes(option)
            ? selected.filter((x: string) => x !== option)
            : [...selected, option]
          ).join(",")
        : option,
    );
  return (
    <Overlay>
      <div ref={playerRef} className={`cm-modal cm-learning-player flex w-full flex-col ${fullscreen ? "h-screen max-h-none max-w-none rounded-none" : "my-auto max-h-[92vh] max-w-6xl"}`}>
        <header className="flex items-center justify-between border-b border-[var(--cm-border)] p-4">
          <div>
            <h2 className="font-bold">{capsule.title}</h2>
            <p className="text-xs text-[var(--cm-text-secondary)]">
              {phase === "CONTENIDO" ? "Contenido" : "Evaluación"} ·{" "}
              {assignment.progress}%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void toggleFullscreen()} className="cm-button-secondary grid h-10 w-10 place-items-center p-0" title={fullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa"} aria-label={fullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa"}>
              {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => void closePlayer()} className="grid h-10 w-10 place-items-center" title="Cerrar" aria-label="Cerrar">
              <X />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {phase === "CONTENIDO" ? (
            <ContentFrame
              capsule={capsule}
              fullscreen={fullscreen}
              onEvent={(event: any) =>
                void onSave(
                  event.type === "CONTENT_COMPLETED"
                    ? { contentViewed: true }
                    : event.type === "DURATION"
                      ? { duration: event.value }
                      : {},
                )
              }
            />
          ) : (
            <div className="mx-auto max-w-2xl">
              <h3 className="text-lg font-bold">{capsule.evaluation.prompt}</h3>
              {isForum && (
                <section className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold">Participaciones del foro</h4>
                    <span className="cm-badge">{forumPosts.length} respuestas</span>
                  </div>
                  {forumPosts.map((post) => (
                    <article key={post.id} className="cm-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--cm-primary)]">{post.advisorName}</strong>
                        <time className="text-[10px] text-[var(--cm-text-muted)]">{new Date(post.createdAt).toLocaleString("es-PE")}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--cm-text-secondary)]">{post.text}</p>
                    </article>
                  ))}
                  {!forumPosts.length && <p className="rounded-lg border border-dashed border-[var(--cm-border)] p-4 text-center text-xs text-[var(--cm-text-secondary)]">Sé el primero en participar.</p>}
                  {forumError && <p className="text-xs text-[var(--cm-danger)]">{forumError}</p>}
                  <h4 className="pt-2 text-sm font-bold">Añadir nueva respuesta</h4>
                </section>
              )}
              {capsule.evaluation.type === "FORMULARIO" &&
              ["UNICA", "MULTIPLE", "VF"].includes(
                capsule.evaluation.questionType || "",
              ) ? (
                (capsule.evaluation.questionType === "VF"
                  ? ["Verdadero", "Falso"]
                  : capsule.evaluation.options || []
                ).map((option) => (
                  <label key={option} className="cm-card mt-3 flex gap-2 p-3">
                    <input
                      type={multiple ? "checkbox" : "radio"}
                      name="answer"
                      checked={selected.includes(option)}
                      onChange={() => choose(option)}
                    />
                    {option}
                  </label>
                ))
              ) : (
                <textarea
                  className="cm-input mt-4 min-h-40 p-3"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={
                    capsule.evaluation.type === "FORO"
                      ? "Publica tu participación…"
                      : "Escribe tu respuesta…"
                  }
                />
              )}{" "}
              {assignment.status === "COMPLETADA" && (
                <div className="cm-card mt-5 p-4">
                  Resultado: {assignment.result ?? "Completada"} · Intentos:{" "}
                  {assignment.attempts}
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t border-[var(--cm-border)] p-4">
          {phase === "CONTENIDO" ? (
            <button
              onClick={() => {
                setPhase("EVALUACION");
                void onSave({ contentViewed: true });
              }}
              className="cm-button-primary px-4 py-2"
            >
              Continuar a evaluación
            </button>
          ) : (
            (isForum || assignment.status !== "COMPLETADA") && (
              <button
                disabled={!answer.trim() || (isForum && answer.trim().length < Number(capsule.evaluation.minChars || 1))}
                onClick={() => void (async () => { await onSave({ answer }); if (isForum) { setAnswer(""); await loadForum(); } })()}
                className="cm-button-primary px-4 py-2"
              >
                {isForum ? "Publicar respuesta" : "Enviar respuesta"}
              </button>
            )
          )}
        </footer>
      </div>
    </Overlay>
  );
};
