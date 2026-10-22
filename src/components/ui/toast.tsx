"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type ToastKind = "info" | "warn" | "error";

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function push(kind: ToastKind, message: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 5000);
}

export const toast = {
  info: (message: string) => push("info", message),
  warn: (message: string) => push("warn", message),
  error: (message: string) => push("error", message),
};

const KIND_STYLES: Record<ToastKind, string> = {
  info: "border-border bg-popover text-foreground",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  error: "border-red-500/40 bg-red-500/75 text-red-200 dark:text-red-200",
};

const KIND_ICON = {
  info: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <div
            key={item.id}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${KIND_STYLES[item.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
