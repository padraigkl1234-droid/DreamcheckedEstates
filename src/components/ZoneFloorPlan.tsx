'use client';

// The zone-level drill-down: a 2.5D isometric floor plan (see lib/isometric.ts
// and lib/zonePlans.ts) with clickable safety-equipment pins layered on top.
// Each pin is a SiteAsset — a real Firestore doc with its own compliance
// due-date, reusing the same red/amber/green thresholds as the general
// Compliance tracker — so the map is a visual index into real data, not a
// static picture.

import React, { useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Check,
  DoorOpen,
  Droplet,
  FireExtinguisher,
  Lightbulb,
  Loader2,
  MapPin,
  Move,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  ASSET_STATUS_COLORS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_LABELS,
  ASSET_TYPES,
  assetStatus,
  type AssetMount,
  type AssetType,
  type SiteAsset,
} from '@/lib/assets';
import { floorPolygon, polygonPoints, project, shadeColor, unprojectFloor, wallSegmentPolygons, ISO_SHADE } from '@/lib/isometric';
import type { ZonePlan } from '@/lib/zonePlans';

const ASSET_ICONS: Record<AssetType, typeof DoorOpen> = {
  fireExit: DoorOpen,
  extinguisher: FireExtinguisher,
  alarmCallPoint: BellRing,
  emergencyLight: Lightbulb,
  hydrant: Droplet,
  assemblyPoint: Users,
};

// How high off the floor a pin renders, by mount — purely visual, so a
// ceiling light reads near the top of the room instead of sitting on the ground.
function mountHeight(mount: AssetMount, roomHeight: number): number {
  if (mount === 'wall') return 1.3;
  if (mount === 'ceiling') return Math.max(roomHeight - 0.3, 0.5);
  return 0.05;
}

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

export function ZoneFloorPlan({
  plan,
  assets,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
}: {
  plan: ZonePlan;
  assets: SiteAsset[];
  canEdit: boolean;
  onCreate: (draft: { type: AssetType; name: string; x: number; y: number; mount: AssetMount }) => Promise<void>;
  onUpdate: (id: string, changes: Partial<SiteAsset>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<AssetType>>(() => new Set(ASSET_TYPES.map((t) => t.value)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addType, setAddType] = useState<AssetType | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = assets.find((a) => a.id === selectedId) ?? null;

  const roomGeometry = useMemo(
    () =>
      plan.rooms.map((room) => ({
        room,
        floor: floorPolygon(room.x0, room.y0, room.x1, room.y1),
        northWalls: wallSegmentPolygons(room.x0, room.y0, room.x1, room.y0, room.height, room.northSolid),
        westWalls: wallSegmentPolygons(room.x0, room.y0, room.x0, room.y1, room.height, room.westSolid),
      })),
    [plan]
  );

  const bounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const g of roomGeometry) {
      for (const p of [...g.floor, ...g.northWalls.flat(), ...g.westWalls.flat()]) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    const pad = 70;
    return {
      minX: Math.min(...xs) - pad,
      minY: Math.min(...ys) - pad - 40, // extra headroom for wall height + labels
      maxX: Math.max(...xs) + pad,
      maxY: Math.max(...ys) + pad,
    };
  }, [roomGeometry]);

  const vbW = bounds.maxX - bounds.minX;
  const vbH = bounds.maxY - bounds.minY;

  const roomAt = (x: number, y: number) => plan.rooms.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

  const screenToFloor = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = bounds.minX + ((clientX - rect.left) / rect.width) * vbW;
    const sy = bounds.minY + ((clientY - rect.top) / rect.height) * vbH;
    return unprojectFloor(sx, sy);
  };

  const handleBackgroundClick = async (e: React.MouseEvent) => {
    const floor = screenToFloor(e.clientX, e.clientY);
    if (!floor) return;
    const room = roomAt(floor.x, floor.y);
    if (!room) {
      if (!repositioning && !addType) setSelectedId(null);
      return;
    }
    const nx = floor.x / plan.width;
    const ny = floor.y / plan.depth;
    if (repositioning && selected) {
      setBusy(true);
      try {
        await onUpdate(selected.id, { x: nx, y: ny });
      } finally {
        setBusy(false);
        setRepositioning(false);
      }
      return;
    }
    if (addType) {
      const meta = ASSET_TYPES.find((t) => t.value === addType)!;
      setBusy(true);
      setError(null);
      try {
        await onCreate({ type: addType, name: meta.label, x: nx, y: ny, mount: meta.defaultMount });
      } catch (err) {
        setError(`Could not add that pin — ${(err as Error).message}`);
      } finally {
        setBusy(false);
        setAddType(null);
      }
      return;
    }
    setSelectedId(null);
  };

  const toggleLayer = (t: AssetType) =>
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await onDelete(id);
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        {/* Layer toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ASSET_TYPES.map((t) => {
            const Icon = ASSET_ICONS[t.value];
            const on = visibleTypes.has(t.value);
            const count = assets.filter((a) => a.type === t.value).length;
            return (
              <button
                key={t.value}
                onClick={() => toggleLayer(t.value)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  on
                    ? 'border-neutral-400/30 bg-invictus-surface/60 text-neutral-200'
                    : 'border-neutral-400/15 bg-transparent text-neutral-600'
                }`}
              >
                <Icon className="h-3 w-3" style={{ color: on ? ASSET_TYPE_COLORS[t.value] : undefined }} />
                {t.label}
                <span className="text-neutral-500">({count})</span>
              </button>
            );
          })}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-neutral-600">
              {addType ? 'Click the floor plan to place it…' : 'Add a pin'}
            </span>
            {ASSET_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setRepositioning(false);
                  setAddType((cur) => (cur === t.value ? null : t.value));
                }}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                  addType === t.value
                    ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-invictus-crimson-bright'
                    : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright'
                }`}
              >
                <Plus className="h-3 w-3" /> {t.label}
              </button>
            ))}
          </div>
        )}

        {repositioning && (
          <p className="rounded-md border border-invictus-crimson-bright/30 bg-invictus-crimson-bright/5 px-3 py-1.5 text-xs text-invictus-crimson-bright">
            Click where this pin should move to…
          </p>
        )}
        {error && <p className="text-xs text-alert">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-neutral-400/20 bg-invictus-base/40">
          <svg
            ref={svgRef}
            viewBox={`${bounds.minX} ${bounds.minY} ${vbW} ${vbH}`}
            className={`w-full ${addType || repositioning ? 'cursor-crosshair' : ''}`}
            style={{ aspectRatio: `${vbW} / ${vbH}` }}
            onClick={handleBackgroundClick}
          >
            {/* Floors */}
            {roomGeometry.map((g) => (
              <polygon
                key={`floor-${g.room.id}`}
                points={polygonPoints(g.floor)}
                fill={shadeColor(g.room.floorColor, ISO_SHADE.floor)}
                stroke="rgba(0,0,0,0.15)"
                strokeWidth={1}
              />
            ))}

            {/* Floor insets (e.g. "Wooden Floor" patches) */}
            {(plan.floorInsets ?? []).map((inset, i) => (
              <polygon
                key={`inset-${i}`}
                points={polygonPoints(floorPolygon(inset.x0, inset.y0, inset.x1, inset.y1))}
                fill={shadeColor(inset.color, ISO_SHADE.floor)}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth={1}
              />
            ))}

            {/* Decor (small floor-level details) */}
            {(plan.decor ?? []).map((d, i) => (
              <polygon
                key={`decor-${i}`}
                points={polygonPoints(floorPolygon(d.x - d.size / 2, d.y - d.size / 2, d.x + d.size / 2, d.y + d.size / 2))}
                fill={d.color}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={1}
              />
            ))}

            {/* Walls */}
            {roomGeometry.map((g) => (
              <React.Fragment key={`walls-${g.room.id}`}>
                {g.northWalls.map((poly, i) => (
                  <polygon
                    key={`n-${i}`}
                    points={polygonPoints(poly)}
                    fill={shadeColor(g.room.floorColor, ISO_SHADE.north)}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={1}
                  />
                ))}
                {g.westWalls.map((poly, i) => (
                  <polygon
                    key={`w-${i}`}
                    points={polygonPoints(poly)}
                    fill={shadeColor(g.room.floorColor, ISO_SHADE.west)}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={1}
                  />
                ))}
              </React.Fragment>
            ))}

            {/* Room labels */}
            {plan.rooms
              .filter((r) => r.label)
              .map((r) => {
                const p = project((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.height + 0.4);
                return (
                  <text key={`label-${r.id}`} x={p.x} y={p.y} textAnchor="middle" fontSize={13} fontWeight={700} fill="rgba(255,255,255,0.55)">
                    {r.label}
                  </text>
                );
              })}

            {/* Free-standing text callouts */}
            {(plan.textLabels ?? []).map((t, i) => {
              const p = project(t.x, t.y, 0);
              return (
                <text key={`text-${i}`} x={p.x} y={p.y} fontSize={11} fontStyle="italic" fill="rgba(255,255,255,0.4)">
                  {t.text}
                </text>
              );
            })}

            {/* Dimension labels */}
            {(plan.dimensionLabels ?? []).map((d, i) => {
              const p = project(d.x, d.y, 0);
              return (
                <text
                  key={`dim-${i}`}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  fontSize={11}
                  fill="rgba(59,130,246,0.7)"
                  transform={d.rot ? `rotate(${d.rot} ${p.x} ${p.y})` : undefined}
                >
                  {d.text}
                </text>
              );
            })}

            {/* Asset pins */}
            {assets
              .filter((a) => visibleTypes.has(a.type))
              .map((a) => {
                const room = roomAt(a.x * plan.width, a.y * plan.depth);
                const z = mountHeight(a.mount, room?.height ?? 3);
                const p = project(a.x * plan.width, a.y * plan.depth, z);
                const status = assetStatus(a);
                const Icon = ASSET_ICONS[a.type];
                const isSelected = selectedId === a.id;
                return (
                  <g
                    key={a.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (repositioning || addType) return;
                      setSelectedId(a.id);
                    }}
                    className="cursor-pointer"
                  >
                    <circle r={isSelected ? 11 : 9} fill={ASSET_TYPE_COLORS[a.type]} stroke={ASSET_STATUS_COLORS[status]} strokeWidth={2.5} />
                    <circle r={isSelected ? 11 : 9} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
                    <foreignObject x={-6} y={-6} width={12} height={12}>
                      <Icon className="h-3 w-3 text-invictus-base" style={{ color: '#111114' }} />
                    </foreignObject>
                  </g>
                );
              })}
          </svg>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-full shrink-0 lg:w-72">
        {!selected ? (
          <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-neutral-400/20 bg-invictus-surface/40 p-5 text-center">
            <MapPin className="h-6 w-6 text-neutral-700" />
            <p className="text-xs text-neutral-500">Click a pin to see its details, or add a new one above.</p>
          </div>
        ) : (
          <AssetPanel
            asset={selected}
            canEdit={canEdit}
            busy={busy}
            onClose={() => setSelectedId(null)}
            onReposition={() => setRepositioning(true)}
            onUpdate={(changes) => onUpdate(selected.id, changes)}
            onDelete={() => remove(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

function AssetPanel({
  asset,
  canEdit,
  busy,
  onClose,
  onReposition,
  onUpdate,
  onDelete,
}: {
  asset: SiteAsset;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onReposition: () => void;
  onUpdate: (changes: Partial<SiteAsset>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(asset.name);
  const [nextDueDate, setNextDueDate] = useState(asset.nextDueDate ?? '');
  const [notes, setNotes] = useState(asset.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = assetStatus(asset);
  const Icon = ASSET_ICONS[asset.type];

  const save = () => {
    onUpdate({
      name: name.trim() || asset.name,
      ...(nextDueDate ? { nextDueDate } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  const markChecked = () => {
    const today = new Date().toISOString().slice(0, 10);
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    const nextStr = next.toISOString().slice(0, 10);
    setNextDueDate(nextStr);
    onUpdate({ lastCheckedDate: today, nextDueDate: nextStr });
  };

  return (
    <div className="space-y-3 rounded-xl border border-neutral-400/20 bg-invictus-surface/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ASSET_TYPE_COLORS[asset.type] }}>
            <Icon className="h-3.5 w-3.5" style={{ color: '#111114' }} />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">{ASSET_TYPE_LABELS[asset.type]}</p>
            <span
              className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
              style={{ borderColor: ASSET_STATUS_COLORS[status], color: ASSET_STATUS_COLORS[status] }}
            >
              {ASSET_STATUS_LABELS[status]}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-500 transition-colors hover:text-neutral-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      {canEdit ? (
        <>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Next due</label>
            <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-y`} />
          </div>
          {asset.lastCheckedDate && <p className="text-[11px] text-neutral-500">Last checked {asset.lastCheckedDate}</p>}

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={save}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-100 transition-colors hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button
              onClick={markChecked}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Mark checked (+1mo)
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-neutral-400/15 pt-3">
            <button
              onClick={onReposition}
              className="flex items-center gap-1.5 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
            >
              <Move className="h-3 w-3" /> Reposition
            </button>
            <button
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              onMouseLeave={() => setConfirmDelete(false)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                confirmDelete
                  ? 'border-alert/70 bg-alert/20 text-alert'
                  : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:border-alert/50 hover:text-alert'
              }`}
            >
              <Trash2 className="h-3 w-3" /> {confirmDelete ? 'Click again' : 'Delete'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-200">{asset.name}</p>
          {asset.nextDueDate && <p className="text-[11px] text-neutral-500">Next due {asset.nextDueDate}</p>}
          {asset.notes && <p className="text-[11px] text-neutral-500">{asset.notes}</p>}
        </>
      )}
    </div>
  );
}
