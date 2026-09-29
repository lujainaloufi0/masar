export const ROLES = ['admin', 'hr', 'manager', 'member'] as const;
export type Role = (typeof ROLES)[number];

/** A value stored in both languages. Arabic falls back to English when missing. */
export interface Bilingual {
  en: string;
  ar: string;
}

export const ACTIVITY_TYPES = [
  'task_created',
  'task_edited',
  'task_cancelled',
  'task_restored',
  'task_deleted',
  'task_completed',
  'task_reopened',
  'step_done',
  'step_undone',
  'assignee_added',
  'assignee_removed',
  'emp_added',
  'emp_updated',
  'emp_deactivated',
  'emp_reactivated',
  'first_signin',
  'group_added',
  'head_changed',
  'attachment_added',
  'attachment_removed',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = ['assigned', 'completed', 'flag', 'step', 'cancelled', 'overdue', 'pending_signin', 'emp_added'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type TaskStatus = 'scheduled' | 'todo' | 'doing' | 'done' | 'cancelled';

/* ---------- API shapes shared by the API and the web app ---------- */

export interface Me {
  id: string;
  empId: string;
  name: Bilingual;
  title: Bilingual;
  role: Role;
  deptId: string;
  groupIds: string[];
  email: string;
}

export interface OrgDTO {
  name: Bilingual;
  prefix: string;
}

export interface DepartmentDTO {
  id: string;
  name: Bilingual;
  color: string;
  headId: string | null;
}

export interface GroupDTO {
  id: string;
  deptId: string;
  name: Bilingual;
}

export interface PersonDTO {
  id: string;
  empId: string;
  name: Bilingual;
  title: Bilingual;
  role: Role;
  deptId: string;
  groupIds: string[];
  email: string;
  active: boolean;
  pendingPassword: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export interface StepDTO {
  id: string;
  text: Bilingual;
  done: boolean;
  doneById: string | null;
  doneAt: string | null;
}

export interface TaskDTO {
  id: string;
  deptId: string;
  groupId: string;
  createdById: string;
  assigneeIds: string[];
  title: Bilingual;
  desc: Bilingual;
  createdAt: string;
  /** YYYY-MM-DD. Before this day the task is scheduled: only managers see it. */
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  flagged: boolean;
  steps: StepDTO[];
  attachmentCount: number;
}

export interface AttachmentDTO {
  id: string;
  taskId: string;
  /** the step it belongs to; null for files on the task as a whole */
  stepId: string | null;
  uploaderId: string | null;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

/** A completed task as seen on the organization-wide board. */
export type CompletedRowDTO =
  | { restricted: false; task: TaskDTO; daysTaken: number }
  | { restricted: true; id: string; title: Bilingual; deptId: string; daysTaken: number };

export interface ActivityDTO {
  id: string;
  at: string;
  type: ActivityType;
  actorId: string | null;
  taskId: string | null;
  taskTitle: Bilingual | null;
  empId: string | null;
  groupId: string | null;
  deptId: string | null;
}

export interface NotificationDTO {
  id: string;
  at: string;
  read: boolean;
  type: NotificationType;
  taskId: string | null;
  /** Values used to fill the message template, already in both languages where relevant. */
  params: Record<string, Bilingual | string | number>;
}

export interface BootstrapDTO {
  me: Me;
  org: OrgDTO;
  departments: DepartmentDTO[];
  groups: GroupDTO[];
  people: PersonDTO[];
}

/* ---------- Ask Masar (the assistant) ---------- */

/** A task the assistant proposes. Nothing is saved until a person reviews it in the task form and presses Create. */
export interface TaskDraft {
  title: string;
  desc: string;
  groupId: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  assigneeIds: string[];
  steps: string[];
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantReply {
  answer: string;
  /** Tasks the answer is about, so the interface can link to them. */
  taskIds: string[];
  draft: TaskDraft | null;
}
