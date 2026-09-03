import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Info,
  MessageSquare,
  Save,
  X,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  QUALITY_ATTRIBUTES,
  QUALITY_CRITICAL_ERRORS,
  QUALITY_WEIGHTS,
} from "../../data/qualityPueData";
import type {
  ComplianceStatus,
  Evaluation,
  EvaluationItem,
  EvaluationType,
  QualityGuideline,
} from "../../types";
import { AudioPlayer } from "../common/AudioPlayer";
import { filesApi } from "../../api/sharedRepository";

type Result = ComplianceStatus | undefined;
const migrationGuidelines: QualityGuideline[] = QUALITY_ATTRIBUTES.map(
  (item) => ({
    ...item,
    criterion: item.criterion as QualityGuideline["criterion"],
    critical: "critical" in item ? Boolean(item.critical) : false,
    active: true,
  }),
);

export const QualityEvaluationModal: React.FC<{
  onClose: () => void;
  onSuccess?: (value: Evaluation) => void;
}> = ({ onClose, onSuccess }) => {
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const { advisors, campaigns, users, teams, currentUser, addEvaluation } =
    useApp();
  const selectableAdvisors = advisors.filter(
    (advisor) => advisor.status === "ACTIVO" && campaigns.some((campaign) => campaign.id === advisor.campaignId && campaign.status === "ACTIVA"),
  );
  const [advisorId, setAdvisorId] = useState(selectableAdvisors[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:30");
  const [evaluatorId, setEvaluatorId] = useState(currentUser.id);
  const [evaluationType, setEvaluationType] = useState<EvaluationType>(
    "DIAGNOSTICO_INICIAL",
  );
  const [callId, setCallId] = useState(`PUE-${Date.now()}`);
  const [recordingCode, setRecordingCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, Result>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState<string | null>(null);
  const [critical, setCritical] = useState<string[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const [generalComments, setGeneralComments] = useState("");
  const [audio, setAudio] = useState<{
    url: string;
    name: string;
    size: number;
    type: string;
    duration: number;
    file?: File;
  } | null>(null);
  const [audioError, setAudioError] = useState("");
  const advisor = advisors.find((a) => a.id === advisorId);
  const supervisor = users.find((u) => u.id === advisor?.supervisorId);
  const team = teams.find((t) => t.id === advisor?.teamId);
  const evaluators = users.filter((u) => u.role !== "ASESOR");
  const campaign = campaigns.find((c) => c.id === advisor?.campaignId);
  const criterionWeights = campaign?.qualityCriterionWeights || QUALITY_WEIGHTS;
  const criterionWeight = (value: string) => criterionWeights[value as keyof typeof criterionWeights] || 0;
  const criticalErrors = (campaign?.qualityCriticalErrors?.length
    ? campaign.qualityCriticalErrors
    : QUALITY_CRITICAL_ERRORS.map((error) => ({ ...error, active: true }))).filter((error) => error.active);
  const guidelines = (
    campaign?.qualityGuidelines?.length
      ? campaign.qualityGuidelines
      : /migraciones bitel/i.test(campaign?.name || "")
        ? migrationGuidelines
        : []
  ).filter((item) => item.active);
  const summary = useMemo(() => {
    const groups = ["C1", "C2", "C3", "C4"].map((criterion) => {
      const rows = guidelines.filter(
        (a) =>
          a.criterion === criterion &&
          answers[a.id] &&
          answers[a.id] !== "NO_APLICA",
      );
      const denom = rows.reduce((n, a) => n + a.weight, 0);
      const valid = rows
        .filter((a) => answers[a.id] === "CUMPLE")
        .reduce((n, a) => n + a.weight, 0);
      return {
        criterion,
        score: denom ? Math.round((valid / denom) * 100) : null,
        active: !!rows.length,
        weight: criterionWeight(criterion),
      };
    });
    const denom = groups
      .filter((g) => g.active)
      .reduce((n, g) => n + g.weight, 0);
    const base = groups.reduce(
      (n, g) => n + ((g.score || 0) / 100) * g.weight,
      0,
    );
    const invalid =
      critical.length > 0 ||
      guidelines.some((a) => (a.critical || a.classification?.startsWith("CRITICO_")) && answers[a.id] === "NO_CUMPLE");
    return {
      groups,
      invalid,
      score: denom ? Math.round((base / denom) * 100) : null,
      obtained: Math.round(base * 100),
      denominator: Math.round(denom * 100),
      answered: denom > 0,
    };
  }, [answers, critical, guidelines, criterionWeights]);
  const update = (id: string, value: Result) => {
    setAnswers((p) => ({ ...p, [id]: value }));
    setDraftSaved(false);
  };
  const finalize = async () => {
    if (!advisor || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    let persistedAudioUrl = audio?.url;
    if (audio?.file) {
      try {
        persistedAudioUrl =
          (await filesApi.upload(audio.file)).url || audio.url;
      } catch (error: any) {
        setAudioError(
          error.message || "No fue posible guardar el audio en Google Drive.",
        );
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
    }
    const dimensions: Record<string, any> = {
      C1: "CONECTAR",
      C2: "CLARIFICAR",
      C3: "CONVERTIR",
      C4: "CONECTAR_C4",
    };
    const items = guidelines.map(
      (a) =>
        ({
          id: `item_${a.id}`,
          criterionId: a.id,
          dimension: dimensions[a.criterion],
          compliance: answers[a.id],
          percentage: answers[a.id] === "CUMPLE" ? 100 : 0,
          level:
            answers[a.id] === "CUMPLE"
              ? 4
              : answers[a.id] === "NO_CUMPLE"
                ? 1
                : 0,
          finding: comments[a.id] || "",
          evidence: "",
          recommendedAction: "",
          attributeWeight: a.weight,
          qualityGuideline: a,
          category: a.category || a.criterion,
          attribute: a.name,
          errorType: answers[a.id] === "NO_CUMPLE" ? (a.errorType || (a.critical ? "Incumplimiento crítico" : "Incumplimiento de atributo")) : "",
          classification: a.classification || (a.critical
            ? (/compliance|cumplimiento/i.test(a.focus) ? "CRITICO_COMPLIANCE" : /usuario/i.test(a.focus) ? "CRITICO_USUARIO_FINAL" : "CRITICO_NEGOCIO")
            : "NO_CRITICO"),
        }) as EvaluationItem,
    );
    const saved = addEvaluation({
      advisorId: advisor.id,
      evaluatorId,
      campaignId: advisor.campaignId,
      teamId: advisor.teamId,
      supervisorId: advisor.supervisorId,
      product:
        campaigns.find((c) => c.id === advisor.campaignId)?.products[0] || "",
      date,
      time,
      callId,
      recordingCode: recordingCode || audio?.name || "",
      type: evaluationType,
      evaluationType: "QUALITY",
      qualityStatus: "FINALIZED",
      source: "MANUAL",
      validationStatus: "VALIDADO",
      validatedAt: new Date().toISOString(),
      qualityCriticalErrorIds: critical,
      qualityCriticalErrorSnapshot: criticalErrors.filter((error) => critical.includes(error.id)),
      sale: false,
      saleResult: "NO_VENTA",
      comments: generalComments,
      primaryGap: "",
      secondaryGap: "",
      strongestPillar: "",
      recommendation: "",
      audioUrl: persistedAudioUrl,
      audioFileName: audio?.name,
      audioFileSize: audio?.size,
      audioMimeType: audio?.type,
      audioDurationSeconds: audio?.duration,
      items,
    });
    onSuccess?.(saved);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/65 p-2 sm:p-4 backdrop-blur-sm">
      <div className="cm-modal cm-evaluation-modal flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#E2E9E9] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#004F50] text-xs font-black text-white">
              PUE
            </div>
            <div>
              <h2 className="text-lg font-bold">
                Evaluación CALIDAD · {campaign?.name || "Selecciona un asesor"}
              </h2>
              <p className="flex items-center gap-1 text-xs text-[#66767A]">
                {(["C1", "C2", "C3", "C4"] as const).map((key) => `${key} ${Math.round(criterionWeights[key] * 100)}%`).join(" · ")}{" "}
                <Info className="h-3.5 w-3.5" />
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#102A2E] hover:bg-[#F1F6F6]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <section className="space-y-4 rounded-xl border border-[#E2E9E9] bg-[#FBFCFC] p-4">
            <h4 className="border-b border-[#E2E9E9] pb-2 text-xs font-bold uppercase tracking-wider text-[#43565A]">
              1. Datos generales de la llamada y asesor
            </h4>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <label className="font-semibold text-[#43565A]">
                Asesor a evaluar
                <select
                  value={advisorId}
                  onChange={(e) => setAdvisorId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] bg-white px-3 py-2 text-sm font-medium"
                >
                  <option value="">Selecciona un asesor</option>
                      {selectableAdvisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block font-normal text-[#66767A]">
                  {supervisor?.name || "Sin supervisor"} ·{" "}
                  {team?.name || "Sin equipo"}
                </span>
              </label>
              <div className="font-semibold text-[#43565A]">
                Cuartil del asesor
                <div className="mt-1 rounded-lg bg-[#E7F4F3] px-3 py-2 text-center text-sm font-bold text-[#006B6B]">
                  {advisor?.quartile || "Sin cuartil"}
                </div>
              </div>
              <label className="font-semibold text-[#43565A]">
                Fecha de evaluación
                <div className="relative mt-1">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-[#D7E2E2] px-3 py-2 text-sm"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-[#006B6B]" />
                </div>
              </label>
              <label className="font-semibold text-[#43565A]">
                Evaluador / consultor
                <select
                  value={evaluatorId}
                  onChange={(e) => setEvaluatorId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] bg-white px-3 py-2 text-sm"
                >
                  {evaluators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-semibold text-[#43565A]">
                Tipo de evaluación
                <select
                  value={evaluationType}
                  onChange={(e) =>
                    setEvaluationType(e.target.value as EvaluationType)
                  }
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] bg-white px-3 py-2 text-sm"
                >
                  <option value="DIAGNOSTICO_INICIAL">
                    Diagnóstico inicial
                  </option>
                  <option value="SEGUIMIENTO">Seguimiento</option>
                  <option value="COACHING">Coaching</option>
                  <option value="REEVALUACION">Reevaluación</option>
                  <option value="CERTIFICACION">Certificación</option>
                </select>
              </label>
              <label className="font-semibold text-[#43565A]">
                Hora de llamada
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] px-3 py-2 text-sm"
                />
              </label>
              <label className="font-semibold text-[#43565A]">
                ID de llamada
                <input
                  value={callId}
                  onChange={(e) => setCallId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] px-3 py-2 text-sm"
                />
              </label>
              <label className="font-semibold text-[#43565A]">
                Código de grabación
                <input
                  value={recordingCode}
                  onChange={(e) => setRecordingCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7E2E2] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
            <div className="rounded-xl border border-[#E2E9E9] bg-white p-4">
              <h4 className="text-sm font-bold">Contexto de la evaluación</h4>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="block text-[#66767A]">Asesor</span>
                  <strong>{advisor?.name || "Sin asesor"}</strong>
                </div>
                <div>
                  <span className="block text-[#66767A]">Cuartil</span>
                  <strong className="text-[#006B6B]">
                    {advisor?.quartile || "Sin cuartil"}
                  </strong>
                </div>
                <div>
                  <span className="block text-[#66767A]">Supervisor</span>
                  <strong>{supervisor?.name || "Sin supervisor"}</strong>
                </div>
                <div>
                  <span className="block text-[#66767A]">Campaña</span>
                  <strong>
                    {campaigns.find((c) => c.id === advisor?.campaignId)
                      ?.name || "Sin campaña"}
                  </strong>
                </div>
              </div>
            </div>
            <aside className="rounded-xl border border-[#DCEAE8] bg-[#FBFDFD] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#43565A]">
                    CALIDAD TÉCNICA
                  </p>
                  <p
                    className="mt-1 text-3xl font-black text-[#008B88]"
                  >
                    {summary.score === null ? "—" : `${summary.score}%`}
                  </p>
                  <p className="text-xs text-[#66767A]">
                    {summary.answered
                      ? `${summary.obtained} de ${summary.denominator} pts evaluables`
                      : "Sin ítems respondidos"}
                  </p>
                </div>
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-[8px] text-xs font-bold ${summary.invalid ? "border-[#FF4D4F] text-[#FF4D4F]" : "border-[#00B8B0] text-[#006B6B]"}`}
                >
                  {summary.score === null ? "—" : `${summary.score}%`}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-[10px]">
                {summary.groups.map((g) => (
                  <span key={g.criterion}>
                    {g.criterion}{" "}
                    <b className="text-[#008B88]">
                      {g.score === null ? "—" : `${g.score}%`}
                    </b>
                  </span>
                ))}
              </div>
              {summary.invalid && (
                <p className="mt-2 text-xs font-bold text-[#FF4D4F]">
                  Resultado: REPROBADA · Error crítico.
                </p>
              )}
            </aside>
          </section>
          <section className="rounded-xl border border-[#E2E9E9] bg-white p-4">
            <div className="mb-3">
              <h4 className="text-sm font-bold">
                2. Grabación de audio de la llamada
              </h4>
              <p className="text-xs text-[#66767A]">
                Carga, reemplaza o reproduce el audio evaluado.
              </p>
            </div>
            {audioError && (
              <p
                role="alert"
                className="mb-3 text-xs font-medium text-[var(--cm-danger)]"
              >
                {audioError}
              </p>
            )}
            <AudioPlayer
              audioUrl={audio?.url}
              audioFileName={audio?.name}
              audioDurationSeconds={audio?.duration}
              onAudioUpload={(file, url, duration) => {
                setAudio({
                  url,
                  name: file.name,
                  size: file.size,
                  type: /\.(mp3|mpeg|mpg)$/i.test(file.name)
                    ? "audio/mpeg"
                    : file.type,
                  duration,
                  file,
                });
                setAudioError("");
                setRecordingCode(file.name);
                setDraftSaved(false);
              }}
              onRemoveAudio={() => {
                setAudio(null);
                setAudioError("");
                setDraftSaved(false);
              }}
            />
          </section>
          <section className="overflow-x-auto rounded-xl border border-[#E2E9E9]">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[70px_minmax(270px,1fr)_70px_150px_100px_70px] gap-3 bg-[#F7FAFA] px-4 py-3 text-[11px] font-bold text-[#43565A]">
                <span>Ítem</span>
                <span>Atributo y pauta PUE</span>
                <span>Peso</span>
                <span>Resultado</span>
                <span>Puntos</span>
                <span>Comentario</span>
              </div>
              {guidelines.map((a) => {
                const answer = answers[a.id];
                const points =
                  answer === undefined || answer === "NO_APLICA"
                    ? "—"
                    : answer === "CUMPLE"
                      ? `${Math.round(a.weight * criterionWeight(a.criterion) * 100)} pts`
                      : "0 pts";
                return (
                  <React.Fragment key={a.id}>
                    <div className="grid grid-cols-[70px_minmax(270px,1fr)_70px_150px_100px_70px] gap-3 border-t border-[#E2E9E9] px-4 py-3 text-sm">
                      <b className="pt-1">{a.code}</b>
                      <div>
                        <b className="text-xs">{a.name}</b>
                        {a.category && <span className="ml-2 text-[10px] text-[#66767A]">{a.category}</span>}
                        {"critical" in a && a.critical && (
                          <span className="ml-2 text-[10px] font-bold text-[#FF4D4F]">
                            CRÍTICO
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-[#66767A]">
                          {a.focus}
                        </span>
                        {answer === "NO_CUMPLE" && <span className="mt-1 block text-[10px] font-semibold text-[#FF4D4F]">{a.errorType || "Incumplimiento de atributo"} · {(a.classification || (a.critical ? "CRITICO_NEGOCIO" : "NO_CRITICO")).replaceAll("_", " ")}</span>}
                        <button
                          type="button"
                          onClick={() =>
                            setGuideOpen(guideOpen === a.id ? null : a.id)
                          }
                          className="mt-1 text-xs font-semibold text-[#008B88]"
                        >
                          {guideOpen === a.id
                            ? "Ocultar pauta"
                            : "Ver criterio, malas prácticas y exclusión"}
                        </button>
                      </div>
                      <b className="pt-1 text-xs">{a.weight * 100}%</b>
                      <select
                        value={answer || ""}
                        onChange={(e) =>
                          update(
                            a.id,
                            e.target.value
                              ? (e.target.value as ComplianceStatus)
                              : undefined,
                          )
                        }
                        className={`h-10 rounded-lg border border-[#D8E3E3] bg-white px-3 text-xs font-semibold ${answer === "NO_CUMPLE" ? "text-[#FF4D4F]" : answer === "CUMPLE" ? "text-[#008B88]" : "text-[#66767A]"}`}
                      >
                        <option value="">Sin responder</option>
                        <option value="CUMPLE">Cumple</option>
                        <option value="NO_CUMPLE">No cumple</option>
                        {a.noApplies && (
                          <option value="NO_APLICA">No aplica</option>
                        )}
                      </select>
                      <b
                        className={`pt-2 text-xs ${answer === "NO_CUMPLE" ? "text-[#FF4D4F]" : "text-[#008B88]"}`}
                      >
                        {points}
                      </b>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentOpen(commentOpen === a.id ? null : a.id)
                        }
                        className={`h-10 rounded-lg border p-2 ${comments[a.id]?.trim() ? "border-[#00B8B0] bg-[#CDEDEC] text-[#005E5A]" : "border-[#9ACDCA] bg-[#F0FAF9] text-[#006B6B]"}`}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    </div>
                    {guideOpen === a.id && (
                      <div className="mx-4 mb-3 rounded-lg border border-[#BFE5E1] bg-[#F3FAF9] p-3 text-xs text-[#43565A]">
                        <p>
                          <b>Esperado:</b> {a.expected}
                        </p>
                        <p className="mt-1">
                          <b>No cumple:</b> {a.failures}
                        </p>
                        <p className="mt-1">
                          <b>No aplica:</b> {a.exclusion}
                        </p>
                      </div>
                    )}
                    {commentOpen === a.id && (
                      <div className="border-t border-[#B8DDDA] bg-[#DFF3F2] px-[86px] py-4">
                        <textarea
                          value={comments[a.id] || ""}
                          onChange={(e) => {
                            setComments((p) => ({
                              ...p,
                              [a.id]: e.target.value,
                            }));
                            setDraftSaved(false);
                          }}
                          placeholder="Agregar comentario sobre este criterio..."
                          rows={3}
                          className="w-full rounded-lg border-2 border-[#79BDB9] bg-white p-3 text-sm text-[#102A2E] outline-none focus:border-[#008B88]"
                        />
                        <div className="mt-2 text-right">
                          <button
                            type="button"
                            onClick={() => setCommentOpen(null)}
                            className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#006B6B] ring-1 ring-[#79BDB9]"
                          >
                            Guardar y cerrar
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </section>
          <section className="rounded-xl border border-[#E2E9E9] bg-[#FBFCFC] p-4">
            <label className="text-sm font-bold">
              Descripción general de la llamada
            </label>
            <textarea
              value={generalComments}
              onChange={(e) => {
                setGeneralComments(e.target.value);
                setDraftSaved(false);
              }}
              rows={3}
              placeholder="Describe el desarrollo general de la llamada y la retroalimentación para el asesor..."
              className="mt-2 w-full rounded-lg border border-[#A9D2D0] bg-white p-3 text-sm text-[#102A2E] outline-none focus:border-[#008B88]"
            />
          </section>
          <section className="rounded-xl border border-[#FFCACA] bg-[#FFF7F7] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#FF4D4F]">
              <AlertTriangle className="h-4 w-4" />
              Errores críticos 4.1 — cualquiera deja la PUE en 0%
            </div>
            <div className="mt-3 space-y-1.5">
              {criticalErrors.map((error) => (
                <label
                  key={error.id}
                  className="flex items-center gap-2 text-xs text-[#43565A]"
                >
                  <input
                    type="checkbox"
                    checked={critical.includes(error.id)}
                    onChange={(e) => {
                      setCritical((p) =>
                        e.target.checked
                          ? [...p, error.id]
                          : p.filter((id) => id !== error.id),
                      );
                      setDraftSaved(false);
                    }}
                  />
                  {error.name}
                </label>
              ))}
            </div>
          </section>
        </div>
        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#E2E9E9] bg-white px-6 py-4 sm:flex-row">
          <div className="flex items-center gap-4">
            <div>
              <span className="block text-[10px] font-bold uppercase text-[#006B6B]">
                Calidad técnica
              </span>
              <strong
                className="text-2xl text-[#008B88]"
              >
                {summary.score === null ? "—" : `${summary.score}%`}
              </strong>
              {summary.invalid && <span className="ml-3 text-xs font-bold text-[#FF4D4F]">REPROBADA</span>}
            </div>
            <span className="hidden text-xs text-[#66767A] md:block">
              {draftSaved
                ? "Borrador conservado en esta ficha"
                : "Los cambios se calculan en tiempo real"}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-[#66767A]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setDraftSaved(true)}
              disabled={!advisor}
              className="inline-flex items-center gap-2 rounded-lg border border-[#00B8B0] px-4 py-2 text-sm font-bold text-[#006B6B] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Guardar borrador
            </button>
            <button
              type="button"
              onClick={finalize}
              disabled={!advisor || !summary.answered || isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#008B88] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSaving ? "Guardando…" : "Guardar y finalizar"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
