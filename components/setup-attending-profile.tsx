"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Speciality, WorkType } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { specialityLabels, workTypeLabels } from "@/lib/labels";

interface Props {
  userId: string;
  redirectTo: string;
}

/**
 * Shown when an ADMIN or COORDINATOR navigates to a page that requires a
 * psychologist profile but hasn't set one up yet.
 */
export function SetupAttendingProfile({ userId, redirectTo }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [speciality, setSpeciality] = useState<Speciality>(Speciality.CLINICAL);
  const [workType, setWorkType] = useState<WorkType>(WorkType.FULL_TIME);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speciality, workType }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo guardar", description: d.error, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil configurado correctamente", variant: "success" });
    // Force a full navigation so the server re-reads the session with the new psychologistId.
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md mt-12">
      <Card>
        <CardHeader>
          <CardTitle>Configura tu perfil de atención</CardTitle>
          <CardDescription>
            Para acceder a esta sección necesitas registrar tu especialidad.
            Solo se hace una vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Especialidad *</Label>
            <Select value={speciality} onValueChange={(v) => setSpeciality(v as Speciality)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(Speciality).map((s) => (
                  <SelectItem key={s} value={s}>
                    {specialityLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo de trabajo *</Label>
            <Select value={workType} onValueChange={(v) => setWorkType(v as WorkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(WorkType).map((w) => (
                  <SelectItem key={w} value={w}>
                    {workTypeLabels[w]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Guardando…" : "Guardar y continuar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
