"use client";

import { useState } from "react";
import {
  ServiceArea,
  ReferenceType,
  TimeSlot,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  serviceAreaLabels,
  referenceTypeLabels,
  timeSlotLabels,
} from "@/lib/labels";

export interface PatientFormValues {
  fullName: string;
  age: string;
  dateOfBirth: string;
  curp: string;
  phoneNumber: string;
  address: string;
  postalCode: string;
  email: string;
  serviceArea: ServiceArea | "";
  referenceType: ReferenceType;
  consultationReason: string;
  preferredTimeSlot: TimeSlot | "";
}

const emptyValues: PatientFormValues = {
  fullName: "",
  age: "",
  dateOfBirth: "",
  curp: "",
  phoneNumber: "",
  address: "",
  postalCode: "",
  email: "",
  serviceArea: "",
  referenceType: ReferenceType.NONE,
  consultationReason: "",
  preferredTimeSlot: "",
};

interface PatientFormProps {
  /** API endpoint to POST/PUT to. */
  endpoint: string;
  method?: "POST" | "PUT";
  defaultValues?: Partial<PatientFormValues>;
  submitLabel?: string;
  onSuccess?: (data: unknown) => void;
}

export function PatientForm({
  endpoint,
  method = "POST",
  defaultValues,
  submitLabel = "Enviar",
  onSuccess,
}: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>({
    ...emptyValues,
    ...defaultValues,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);
    setErrors({});

    const payload = {
      ...values,
      age: values.age === "" ? undefined : Number(values.age),
      dateOfBirth: values.dateOfBirth || null,
      curp: values.curp || null,
      email: values.email || null,
      address: values.address || null,
      postalCode: values.postalCode || null,
    };

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.details?.fieldErrors) setErrors(data.details.fieldErrors);
      setServerError(data.error ?? "Ocurrió un error al guardar.");
      return;
    }

    const data = await res.json();
    if (onSuccess) onSuccess(data);
  }

  const fieldError = (key: string) =>
    errors[key]?.[0] ? (
      <p className="text-xs text-destructive">{errors[key][0]}</p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fullName">Nombre completo *</Label>
          <Input
            id="fullName"
            required
            value={values.fullName}
            onChange={(e) => set("fullName", e.target.value)}
          />
          {fieldError("fullName")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="age">Edad *</Label>
          <Input
            id="age"
            type="number"
            min={0}
            max={120}
            required
            value={values.age}
            onChange={(e) => set("age", e.target.value)}
          />
          {fieldError("age")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Celular *</Label>
          <Input
            id="phoneNumber"
            type="tel"
            required
            value={values.phoneNumber}
            onChange={(e) => set("phoneNumber", e.target.value)}
          />
          {fieldError("phoneNumber")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
          />
          {fieldError("email")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="curp">CURP</Label>
          <Input
            id="curp"
            maxLength={18}
            value={values.curp}
            onChange={(e) => set("curp", e.target.value.toUpperCase())}
          />
          {fieldError("curp")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="postalCode">Código postal</Label>
          <Input
            id="postalCode"
            value={values.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input
            id="address"
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Área de servicio *</Label>
          <Select
            value={values.serviceArea}
            onValueChange={(v) => set("serviceArea", v as ServiceArea)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un área" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ServiceArea).map((area) => (
                <SelectItem key={area} value={area}>
                  {serviceAreaLabels[area]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("serviceArea")}
        </div>

        <div className="space-y-2">
          <Label>Horario preferido *</Label>
          <Select
            value={values.preferredTimeSlot}
            onValueChange={(v) => set("preferredTimeSlot", v as TimeSlot)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un horario" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(TimeSlot).map((slot) => (
                <SelectItem key={slot} value={slot}>
                  {timeSlotLabels[slot]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("preferredTimeSlot")}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Tipo de referencia / convenio</Label>
          <Select
            value={values.referenceType}
            onValueChange={(v) => set("referenceType", v as ReferenceType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ReferenceType).map((ref) => (
                <SelectItem key={ref} value={ref}>
                  {referenceTypeLabels[ref]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="consultationReason">Motivo de consulta *</Label>
          <Textarea
            id="consultationReason"
            required
            value={values.consultationReason}
            onChange={(e) => set("consultationReason", e.target.value)}
          />
          {fieldError("consultationReason")}
        </div>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
