"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentMemory } from "@/lib/api-client";
import { forgetAgentMemory, getAgentMemory, saveAgentMemory, updateAgentMemory } from "@/lib/api-client";
import { useT } from "@/lib/i18n";

export function AgentMemoryPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState<AgentMemory["category"]>("preference");
  const [editingId, setEditingId] = useState<string | null>(null);

  const memoryQuery = useQuery({ queryKey: ["agent-memory", userId], queryFn: () => getAgentMemory(userId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agent-memory", userId] });
  const saveMutation = useMutation({
    mutationFn: () => editingId
      ? updateAgentMemory(userId, editingId, { key, value, category })
      : saveAgentMemory(userId, { key, value, category }),
    onSuccess: async () => {
      setKey(""); setValue(""); setCategory("preference"); setEditingId(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const forgetMutation = useMutation({
    mutationFn: (memoryId: string) => forgetAgentMemory(userId, memoryId),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const beginEdit = (item: AgentMemory) => {
    setEditingId(item.id); setKey(item.key); setValue(item.value); setCategory(item.category);
  };
  const cancelEdit = () => { setEditingId(null); setKey(""); setValue(""); setCategory("preference"); };
  const items = memoryQuery.data?.items ?? [];

  return (
    <section className="mb-3 rounded-xl border border-gold/30 bg-card p-4 shadow-sm" aria-labelledby="memory-panel-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="memory-panel-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Brain className="size-4 text-gold" /> {t.memory.title}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t.memory.description}</p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t.memory.close}>
          <X className="size-4" />
        </Button>
      </div>

      <form
        className="grid gap-2 md:grid-cols-[minmax(9rem,0.7fr)_minmax(12rem,1.4fr)_minmax(10rem,0.8fr)_auto]"
        onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }}
      >
        <Input value={key} onChange={(event) => setKey(event.target.value)} maxLength={80} placeholder={t.memory.key} aria-label={t.memory.key} required />
        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} placeholder={t.memory.value} aria-label={t.memory.value} required />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AgentMemory["category"])}
          aria-label={t.memory.category}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <option value="preference">{t.memory.preference}</option>
          <option value="confirmed_work_context">{t.memory.workContext}</option>
        </select>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saveMutation.isPending}>
            {editingId ? <Save className="size-3.5" /> : <Plus className="size-3.5" />}
            {editingId ? t.memory.update : t.memory.remember}
          </Button>
          {editingId && <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>{t.common.cancel}</Button>}
        </div>
      </form>

      <div className="mt-3 space-y-2" aria-live="polite">
        {memoryQuery.isPending ? <p className="text-xs text-muted-foreground">{t.common.loading}</p> : null}
        {!memoryQuery.isPending && items.length === 0 ? <p className="text-xs text-muted-foreground">{t.memory.empty}</p> : null}
        {items.map((item) => (
          <article key={item.id} className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="break-words text-xs font-semibold text-foreground">{item.key}</p>
              <p className="break-words text-xs text-muted-foreground">{item.value}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-gold/80">{item.category === "preference" ? t.memory.preference : t.memory.workContext}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" size="icon" variant="ghost" aria-label={`${t.memory.edit} ${item.key}`} onClick={() => beginEdit(item)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`${t.memory.forget} ${item.key}`} disabled={forgetMutation.isPending} onClick={() => forgetMutation.mutate(item.id)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
