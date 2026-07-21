"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SURVEY_QUESTIONS,
  optionsFor,
  type SurveyAnswers,
} from "@/lib/survey";
import { cn } from "@/lib/utils";

/**
 * Formulario público de la encuesta. Cada pregunta se pinta con las opciones de
 * su escala, tomadas de `lib/survey.ts`: añadir una pregunta ahí la hace
 * aparecer aquí sin tocar este componente.
 */
export function SurveyForm({ onSuccess }: { onSuccess: () => void }) {
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = SURVEY_QUESTIONS.filter((q) => !answers[q.id]);
  const complete = missing.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setError("Por favor responde todas las preguntas.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/public/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo enviar la encuesta.");
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {SURVEY_QUESTIONS.map((q, i) => {
        const options = optionsFor(q);
        const chosen = answers[q.id];
        return (
          <fieldset key={q.id} className="space-y-3 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">
              {i + 1}. {q.text}{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </legend>
            <div
              className={cn(
                "grid gap-2",
                options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
              )}
            >
              {options.map((o) => {
                const selected = chosen === o.value;
                return (
                  <button
                    type="button"
                    key={o.value}
                    aria-pressed={selected}
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [q.id]: o.value }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {complete
            ? "Todas las preguntas respondidas."
            : `Faltan ${missing.length} pregunta${missing.length === 1 ? "" : "s"}.`}
        </p>
        <Button type="submit" disabled={submitting || !complete}>
          {submitting ? "Enviando…" : "Enviar encuesta"}
        </Button>
      </div>
    </form>
  );
}
