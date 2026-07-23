"use client";

import { useCallback, useEffect, useState } from "react";
import { Position, Role, Speciality, WorkType } from "@prisma/client";
import { Pencil, Trash2, UserCheck, UserX, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  POSITION_ORDER,
  positionLabels,
  roleLabels,
  specialityLabels,
  workTypeLabels,
} from "@/lib/labels";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  position: Position | null;
  isActive: boolean;
  psychologist: { speciality: Speciality; workType: WorkType } | null;
}

/**
 * Valor del <Select> que representa "sin puesto". Radix Select no admite
 * cadena vacía como valor de un item, así que se usa un centinela.
 */
const NO_POSITION = "NONE";

export function UsersView({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: Role;
}) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(u: UserRow) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo actualizar", description: d.error, variant: "destructive" });
      return;
    }
    toast({ title: u.isActive ? "Usuario desactivado" : "Usuario activado", variant: "success" });
    load();
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo eliminar", description: d.error, variant: "destructive" });
    } else {
      toast({ title: "Usuario eliminado", variant: "success" });
      load();
    }
    setDeleteUser(null);
  }

  const canDeleteTarget = (u: UserRow) =>
    u.id !== currentUserId &&
    !(currentUserRole === Role.COORDINATOR && u.role === Role.ADMIN);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Cargando…"
            : `${users.length} ${users.length === 1 ? "usuario" : "usuarios"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Especialidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay usuarios registrados.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUserId;
                const canManageSelf =
                  isSelf &&
                  (currentUserRole === Role.ADMIN || currentUserRole === Role.COORDINATOR);
                return (
                  <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                        {u.name.charAt(0).toUpperCase()}
                      </span>
                      {u.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline">{roleLabels[u.role]}</Badge>
                      {u.position && (
                        <span className="block text-xs text-muted-foreground">
                          {positionLabels[u.position]}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.psychologist ? (
                      <div className="space-y-0.5">
                        <span>{specialityLabels[u.psychologist.speciality]}</span>
                        <span className="block text-xs text-muted-foreground">
                          {workTypeLabels[u.psychologist.workType]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "success" : "secondary"}>
                      {u.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(!isSelf || canManageSelf) && (
                      <div className="flex items-center justify-end gap-1">
                        {/* Editar */}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          aria-label={`Editar a ${u.name}`}
                          onClick={() => setEditUser(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* Activar / Desactivar */}
                        <Button
                          size="icon"
                          variant="ghost"
                          title={u.isActive ? "Desactivar" : "Activar"}
                          aria-label={`${u.isActive ? "Desactivar" : "Activar"} a ${u.name}`}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? (
                            <UserX className="h-4 w-4 text-amber-500" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>

                        {/* Eliminar */}
                        {canDeleteTarget(u) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Eliminar"
                            aria-label={`Eliminar a ${u.name}`}
                            onClick={() => setDeleteUser(u)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      {editUser && (
        <EditUserDialog
          user={editUser}
          open={!!editUser}
          onOpenChange={(o) => { if (!o) setEditUser(null); }}
          onSaved={load}
        />
      )}

      {/* Confirmación de eliminación */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              ¿Eliminar permanentemente a <strong>{deleteUser?.name}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Edit dialog ───────────────────────── */

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: UserRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [position, setPosition] = useState<string>(user.position ?? NO_POSITION);
  const [speciality, setSpeciality] = useState<Speciality>(
    user.psychologist?.speciality ?? Speciality.CLINICAL,
  );
  const [workType, setWorkType] = useState<WorkType>(
    user.psychologist?.workType ?? WorkType.FELLOW,
  );
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = { name, role, speciality, workType };
    payload.position = position === NO_POSITION ? null : position;
    if (password) payload.password = password;

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar.");
      return;
    }
    toast({ title: "Usuario actualizado", variant: "success" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>Modifica los datos de {user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre completo *</Label>
            <Input
              id="edit-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rol *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(Role).map((r) => (
                  <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Puesto</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_POSITION}>Sin puesto</SelectItem>
                {POSITION_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{positionLabels[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Abre el módulo de esa coordinación en el menú lateral y etiqueta
              los eventos que cree esta persona.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Especialidad</Label>
              <Select value={speciality} onValueChange={(v) => setSpeciality(v as Speciality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(Speciality).map((s) => (
                    <SelectItem key={s} value={s}>{specialityLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de trabajo</Label>
              <Select value={workType} onValueChange={(v) => setWorkType(v as WorkType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(WorkType).map((w) => (
                    <SelectItem key={w} value={w}>{workTypeLabels[w]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-password">Nueva contraseña</Label>
            <Input
              id="edit-password"
              type="password"
              placeholder="Dejar en blanco para no cambiar"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Create dialog ───────────────────────── */

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(Role.PSYCHOLOGIST);
  const [position, setPosition] = useState<string>(NO_POSITION);
  const [speciality, setSpeciality] = useState<Speciality>(Speciality.CLINICAL);
  const [workType, setWorkType] = useState<WorkType>(WorkType.FELLOW);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = { name, email, password, role };
    if (position !== NO_POSITION) {
      payload.position = position;
    }
    if (role === Role.PSYCHOLOGIST) {
      payload.speciality = speciality;
      payload.workType = workType;
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo crear el usuario.");
      return;
    }
    toast({ title: "Usuario creado", variant: "success" });
    setName(""); setEmail(""); setPassword(""); setPosition(NO_POSITION);
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Crea una cuenta de acceso al sistema.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre completo *</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Correo *</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <Input
                id="password"
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Rol *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(Role).map((r) => (
                  <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Puesto</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_POSITION}>Sin puesto</SelectItem>
                {POSITION_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{positionLabels[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Perfil de atención
              <span className="text-xs text-muted-foreground font-normal">
                (obligatorio si atiende pacientes)
              </span>
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Especialidad {role === Role.PSYCHOLOGIST ? "*" : ""}</Label>
              <Select value={speciality} onValueChange={(v) => setSpeciality(v as Speciality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(Speciality).map((s) => (
                    <SelectItem key={s} value={s}>{specialityLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de trabajo {role === Role.PSYCHOLOGIST ? "*" : ""}</Label>
              <Select value={workType} onValueChange={(v) => setWorkType(v as WorkType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(WorkType).map((w) => (
                    <SelectItem key={w} value={w}>{workTypeLabels[w]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
