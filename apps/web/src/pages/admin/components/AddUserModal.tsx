import { useEffect, useState, type FormEvent } from "react";
import { API_ROUTES } from "@mark-matrix/shared";
import { Modal } from "../../../components/Modal/Modal.js";
import { Button } from "../../../components/Button/Button.js";
import { Field } from "../../../components/Field/Field.js";
import { Input } from "../../../components/Input/Input.js";
import { Select } from "../../../components/Select/Select.js";
import { apiFetch } from "../../../lib/api.js";
import styles from "./AddUserModal.module.css";

type Role = "admin" | "faculty" | "student";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty" },
  { value: "admin", label: "Admin" },
];

export interface AddUserModalProps {
  /** Whether the dialog is shown. The dialog renders nothing while false. */
  open: boolean;
  /** Dismiss handler — Cancel, the close button, Escape and the backdrop all call it. */
  onClose: () => void;
  /** Called once the user exists. */
  onCreated: () => void;
}

/**
 * Create a user.
 *
 * A user is three things: the auth account, the profile row, and the role
 * satellite that carries their identity. The API does all three in one
 * request; the form collects what the role needs, because the satellite's
 * identity columns are NOT NULL — a student without a roll number is
 * invisible to every roster.
 */
export function AddUserModal({ open, onClose, onCreated }: AddUserModalProps): JSX.Element {
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [role, setRole] = useState<Role>("student");
  const [rollNumber, setRollNumber] = useState<string>("");
  const [admissionYear, setAdmissionYear] = useState<string>("");
  const [employeeCode, setEmployeeCode] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [designation, setDesignation] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The dialog stays mounted between openings, so reset it once it closes.
  // A failed creation keeps it open, and with it what was already typed.
  useEffect(() => {
    if (open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRole("student");
    setRollNumber("");
    setAdmissionYear("");
    setEmployeeCode("");
    setDepartment("");
    setDesignation("");
    setError(null);
    setFieldErrors({});
  }, [open]);

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload: Record<string, unknown> = { name, email, password, role };
      if (role === "student") {
        payload["rollNumber"] = rollNumber;
        payload["admissionYear"] = admissionYear === "" ? undefined : Number(admissionYear);
      } else {
        payload["employeeCode"] = employeeCode;
        payload["designation"] = designation;
        if (role === "faculty") payload["department"] = department;
      }
      await apiFetch<{ data: { userId: string } }>(API_ROUTES.adminUsers, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onCreated();
    } catch (e) {
      const err = e as {
        body?: {
          error?: string;
          detail?: string;
          fields?: Array<{ path: string; message: string }>;
        };
      };
      const fields: Record<string, string> = {};
      for (const f of err.body?.fields ?? []) fields[f.path] = f.message;
      setFieldErrors(fields);
      setError(err.body?.detail ?? err.body?.error ?? "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (path: string): string | undefined => fieldErrors[path];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={submitting || name.trim() === "" || email.trim() === "" || password === ""}
          >
            {submitting ? "Creating…" : "Create user"}
          </Button>
        </>
      }
    >
      {error !== null && (
        <p role="alert" className={styles["error"]}>
          {error}
        </p>
      )}
      <form
        className={styles["form"]}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Name" htmlFor="add-user-name" error={fieldError("name")}>
          <Input
            id="add-user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="e.g. Anita Rao"
          />
        </Field>
        <Field label="Email" htmlFor="add-user-email" error={fieldError("email")}>
          <Input
            id="add-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            placeholder="anita@example.com"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="add-user-password"
          error={fieldError("password")}
        >
          <Input
            id="add-user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role" htmlFor="add-user-role">
          <Select
            id="add-user-role"
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={ROLE_OPTIONS}
          />
        </Field>

        {role === "student" ? (
          <>
            <Field label="Roll number" htmlFor="add-user-roll" error={fieldError("rollNumber")}>
              <Input
                id="add-user-roll"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                maxLength={40}
                placeholder="e.g. 23BCA014"
              />
            </Field>
            <Field
              label="Admission year"
              htmlFor="add-user-year"
              error={fieldError("admissionYear")}
            >
              <Input
                id="add-user-year"
                type="number"
                value={admissionYear}
                onChange={(e) => setAdmissionYear(e.target.value)}
                min={2000}
                max={3000}
                placeholder="e.g. 2023"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Employee code" htmlFor="add-user-code" error={fieldError("employeeCode")}>
              <Input
                id="add-user-code"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                maxLength={40}
                placeholder="e.g. EMP-014"
              />
            </Field>
            {role === "faculty" && (
              <Field label="Department" htmlFor="add-user-dept" error={fieldError("department")}>
                <Input
                  id="add-user-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Computer Science"
                />
              </Field>
            )}
            <Field label="Designation" htmlFor="add-user-designation" error={fieldError("designation")}>
              <Input
                id="add-user-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                maxLength={120}
                placeholder="e.g. Lecturer"
              />
            </Field>
          </>
        )}

        <p className={styles["note"]}>
          The password is set here — there is no email service in this project, so tell it to the
          new user yourself.
        </p>
      </form>
    </Modal>
  );
}
