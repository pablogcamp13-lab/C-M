import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Campaign, QualityGuideline } from "../../types";

const emptyGuideline = (): QualityGuideline => ({
  id: `quality_${Date.now()}`,
  code: "",
  criterion: "C1",
  name: "",
  weight: 1,
  focus: "",
  critical: false,
  noApplies: false,
  expected: "",
  failures: "",
  exclusion: "",
  active: true,
});

export const CampaignQualityModal: React.FC<{
  campaign: Campaign;
  onClose: () => void;
  onSave: (data: Partial<Campaign>) => void;
}> = ({ campaign, onClose, onSave }) => {
  const [name, setName] = useState(campaign.name);
  const [client, setClient] = useState(campaign.client);
  const [status, setStatus] = useState(campaign.status);
  const [products, setProducts] = useState(campaign.products.join(", "));
  const [guidelines, setGuidelines] = useState<QualityGuideline[]>(
    campaign.qualityGuidelines || [],
  );
  const [editing, setEditing] = useState<QualityGuideline | null>(null);
  const invalidBlocks = (["C1", "C2", "C3", "C4"] as const).filter((criterion) => {
    const rows = guidelines.filter((item) => item.active && item.criterion === criterion);
    return rows.length > 0 && Math.abs(rows.reduce((total, item) => total + item.weight, 0) - 1) > 0.001;
  });
  const field =
    "w-full rounded-lg border border-slate-600 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400";
  const saveGuideline = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing?.code.trim() || !editing.name.trim()) return;
    setGuidelines((current) =>
      current.some((item) => item.id === editing.id)
        ? current.map((item) => (item.id === editing.id ? editing : item))
        : [...current, editing],
    );
    setEditing(null);
  };
  const saveAll = () => {
    if (invalidBlocks.length) return;
    onSave({
      name: name.trim(),
      client: client.trim(),
      status,
      products: products
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      qualityGuidelines: guidelines,
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="cm-modal flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold">
              Campaña y lineamientos de Calidad
            </h3>
            <p className="text-xs text-slate-400">
              Cada campaña conserva su propia pauta de evaluación.
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <section className="grid gap-3 rounded-xl border border-slate-700 p-4 md:grid-cols-2">
            <label className="text-xs font-semibold">
              Nombre
              <input
                className={`mt-1 ${field}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold">
              Cliente / operación
              <input
                className={`mt-1 ${field}`}
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold">
              Productos (separados por coma)
              <input
                className={`mt-1 ${field}`}
                value={products}
                onChange={(e) => setProducts(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold">
              Estado
              <select
                className={`mt-1 ${field}`}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Campaign["status"])
                }
              >
                <option value="ACTIVA">Activa</option>
                <option value="INACTIVA">Inactiva</option>
              </select>
            </label>
          </section>
        <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="font-bold">Lineamientos de Calidad</h4>
                <p className="text-xs text-slate-400">
                  {guidelines.length} criterios configurados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(emptyGuideline())}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950"
              >
                <Plus className="h-4 w-4" />
                Nuevo lineamiento
              </button>
            </div>
            <div className="space-y-2">
              {guidelines.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-700 p-3 text-sm"
                >
                  <b className="w-12 text-cyan-300">{item.code}</b>
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">
                    {item.criterion}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-slate-400">
                    {Math.round(item.weight * 100)}%
                  </span>
                  <button
                    onClick={() => setEditing({ ...item })}
                    className="text-xs text-cyan-300"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() =>
                      setGuidelines((current) =>
                        current.filter((row) => row.id !== item.id),
                      )
                    }
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4 text-rose-400" />
                  </button>
                </div>
              ))}
            </div>
            {invalidBlocks.length > 0 && <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200">Los pesos activos deben sumar 100% dentro de: {invalidBlocks.join(", ")}.</p>}
          </section>
          {editing && (
            <form
              onSubmit={saveGuideline}
              className="grid gap-3 rounded-xl border border-cyan-500/40 bg-cyan-950/15 p-4 md:grid-cols-2"
            >
              <label className="text-xs font-semibold">
                Código
                <input
                  required
                  className={`mt-1 ${field}`}
                  value={editing.code}
                  onChange={(e) =>
                    setEditing({ ...editing, code: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Bloque
                <select
                  className={`mt-1 ${field}`}
                  value={editing.criterion}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      criterion: e.target
                        .value as QualityGuideline["criterion"],
                    })
                  }
                >
                  {["C1", "C2", "C3", "C4"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold md:col-span-2">
                Nombre
                <input
                  required
                  className={`mt-1 ${field}`}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Peso dentro del bloque (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={`mt-1 ${field}`}
                  value={Math.round(editing.weight * 100)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      weight: Number(e.target.value) / 100,
                    })
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Enfoque
                <input
                  className={`mt-1 ${field}`}
                  value={editing.focus}
                  onChange={(e) =>
                    setEditing({ ...editing, focus: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold md:col-span-2">
                Comportamiento esperado
                <textarea
                  className={`mt-1 ${field}`}
                  value={editing.expected}
                  onChange={(e) =>
                    setEditing({ ...editing, expected: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Incumplimientos
                <textarea
                  className={`mt-1 ${field}`}
                  value={editing.failures}
                  onChange={(e) =>
                    setEditing({ ...editing, failures: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Regla de exclusión / No aplica
                <textarea
                  className={`mt-1 ${field}`}
                  value={editing.exclusion}
                  onChange={(e) =>
                    setEditing({ ...editing, exclusion: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editing.critical}
                  onChange={(e) =>
                    setEditing({ ...editing, critical: e.target.checked })
                  }
                />
                Incumplimiento crítico
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editing.noApplies}
                  onChange={(e) =>
                    setEditing({ ...editing, noApplies: e.target.checked })
                  }
                />
                Permite No aplica
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-2 text-xs"
                >
                  Cancelar
                </button>
                <button className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950">
                  Guardar lineamiento
                </button>
              </div>
            </form>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={saveAll}
            disabled={!name.trim() || invalidBlocks.length > 0}
            className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            Guardar campaña
          </button>
        </footer>
      </div>
    </div>
  );
};
